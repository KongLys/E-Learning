import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../gemini.service';
import { CohereService } from '../cohere.service';
import {
  VectorStoreService,
  RetrievedChunk,
  ChunkScope,
} from '../vector/vector-store.service';
import {
  SYSTEM_INSTRUCTION,
  NO_CONTEXT_MESSAGE,
  buildAnswerPrompt,
  buildCompressionPrompt,
  buildQueryAnalysisPrompt,
  QueryAnalysis,
} from './prompts';

export interface Citation {
  chunkId: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  sectionId: string | null;
  lessonId: string | null;
  /** Đoạn trích nguồn để hiển thị khi người dùng rê chuột vào tham chiếu. */
  excerpt: string;
}

export interface AskResult {
  stream: AsyncIterable<string>;
  citations: Citation[];
  contextChunks: RetrievedChunk[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly retrieveTop: number;
  private readonly rerankTop: number;
  private readonly rerankMinScore: number;

  constructor(
    private gemini: GeminiService,
    private cohere: CohereService,
    private vector: VectorStoreService,
    config: ConfigService,
  ) {
    this.retrieveTop = config.get<number>('RAG_RETRIEVE_TOP', 50);
    this.rerankTop = config.get<number>('RAG_RERANK_TOP', 5);
    this.rerankMinScore = config.get<number>('RAG_RERANK_MIN_SCORE', 0.3);
  }

  async ask(
    courseId: string,
    query: string,
    conversationHistory: string[] = [],
    scope?: ChunkScope,
  ): Promise<AskResult> {
    // 1. Query analysis — phân tích intent + sinh biến thể
    const analysis = await this.analyzeQuery(query, conversationHistory);
    const allQueries = unique([analysis.resolvedQuery, ...analysis.variants]).slice(0, 4);
    this.logger.log(`[RAG] original: "${query}" | intent: ${analysis.intent} | subject: "${analysis.subject}"`);
    this.logger.log(`[RAG] resolvedQuery: "${analysis.resolvedQuery}"`);
    this.logger.log(`[RAG] search queries:\n${allQueries.map((q, i) => `  [${i}] ${q}`).join('\n')}`);

    // 2. Embed song song + hybrid search song song (giới hạn theo Phần/Bài nếu có)
    const embeddings = await this.gemini.embedBatch(allQueries);
    const pools = await Promise.all(
      allQueries.map((q, i) =>
        this.vector.hybridSearch(
          courseId,
          embeddings[i],
          q,
          this.retrieveTop,
          scope,
        ),
      ),
    );
    const fused = reciprocalRankFusion(pools, this.retrieveTop);
    this.logger.log(`[RAG] fused pool: ${fused.length} chunks`);
    fused.slice(0, 10).forEach((c, i) =>
      this.logger.log(`  [${i}] score=${c.score.toFixed(4)} | ${c.content.slice(0, 80).replace(/\n/g, ' ')}`),
    );

    const noContextResult = (): AskResult => ({
      stream: emptyStream(NO_CONTEXT_MESSAGE),
      citations: [],
      contextChunks: [],
    });

    if (fused.length === 0) {
      return noContextResult();
    }

    // 3. Rerank với Cohere → top K (threshold tạm bỏ).
    const rerankResults = await this.cohere.rerank(
      query,
      fused.map((c) => c.content),
      this.rerankTop,
    );
    this.logger.log(`[RAG] rerank top ${rerankResults.length}:`);
    rerankResults.forEach((r, i) =>
      this.logger.log(`  [${i}] score=${r.relevanceScore.toFixed(4)} | ${fused[r.index].content.slice(0, 80).replace(/\n/g, ' ')}`),
    );
    const topK = rerankResults.map((r) => fused[r.index]);

    // 4. Compression — Gemini trích đoạn liên quan
    const compressed = await this.compress(
      analysis.resolvedQuery,
      topK.map((c) => c.content),
    );

    this.logger.log(`[RAG] compressed context (${compressed.length} chars):\n${compressed.slice(0, 300).replace(/\n/g, ' ')}`);
    // Cổng B: compression không tìm thấy đoạn liên quan nào ⇒ "chưa đề cập".
    if (!compressed.trim()) {
      this.logger.debug('RAG gate: compression returned empty context');
      return noContextResult();
    }

    // 5. Generate answer
    const citations: Citation[] = topK.map((c) => ({
      chunkId: c.id,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      sectionId: c.sectionId,
      lessonId: c.lessonId,
      excerpt: truncateExcerpt(c.content),
    }));
    const prompt = buildAnswerPrompt(
      analysis.resolvedQuery,
      compressed,
      topK.map((c, i) => ({
        index: i,
        sectionTitle: c.sectionTitle,
        pageNumber: c.pageNumber,
      })),
      conversationHistory,
    );
    const stream = this.gemini.generateStream(prompt, {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
    });

    return { stream, citations, contextChunks: topK };
  }

  private async analyzeQuery(
    query: string,
    history: string[],
  ): Promise<QueryAnalysis> {
    const fallback: QueryAnalysis = {
      intent: 'other',
      subject: query,
      resolvedQuery: query,
      variants: [query, query, query],
    };
    try {
      const text = await this.gemini.generate(
        buildQueryAnalysisPrompt(query, history),
        { temperature: 0.1, maxOutputTokens: 512 },
      );
      const json = text.replace(/```(?:json)?|```/g, '').trim();
      const parsed = JSON.parse(json) as QueryAnalysis;
      if (!parsed.resolvedQuery || !Array.isArray(parsed.variants) || parsed.variants.length < 3) {
        return fallback;
      }
      return parsed;
    } catch (err) {
      this.logger.warn(`Query analysis failed, using original: ${(err as Error).message}`);
      return fallback;
    }
  }

  private async compress(query: string, chunks: string[]): Promise<string> {
    if (chunks.length === 0) return '';
    try {
      return await this.gemini.generate(buildCompressionPrompt(query, chunks), {
        temperature: 0.0,
        maxOutputTokens: 1024,
      });
    } catch (err) {
      this.logger.warn(
        `Compression failed, using raw chunks: ${(err as Error).message}`,
      );
      return chunks.map((c, i) => `[Đoạn ${i + 1}] ${c}`).join('\n\n');
    }
  }
}

function reciprocalRankFusion(
  pools: RetrievedChunk[][],
  topK: number,
): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();
  for (const pool of pools) {
    pool.forEach((chunk, rank) => {
      const existing = scores.get(chunk.id);
      const contribution = 1 / (60 + rank);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(chunk.id, { chunk, score: contribution });
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((e) => e.chunk);
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Đoạn trích nguồn để hiển thị trong card tham chiếu: lấy GẦN TRỌN nội dung chunk
 * (chunk vốn đã bị giới hạn kích thước), giữ ngắt đoạn để dễ đọc, chỉ chặn trên
 * một ngưỡng rất cao để tránh payload bất thường. Card ở frontend cuộn được.
 */
function truncateExcerpt(content: string, max = 4000): string {
  const text = content
    .replace(/[ \t]+/g, ' ') // gộp space/tab, GIỮ xuống dòng
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

async function* emptyStream(msg: string): AsyncGenerator<string> {
  yield msg;
}
