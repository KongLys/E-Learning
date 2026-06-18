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
  buildQueryRewritePrompt,
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
    // 1. Query rewrite — sinh các biến thể truy vấn
    const rewrites = await this.queryRewrite(query, conversationHistory);
    const allQueries = unique([query, ...rewrites]).slice(0, 3);

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

    const noContextResult = (): AskResult => ({
      stream: emptyStream(NO_CONTEXT_MESSAGE),
      citations: [],
      contextChunks: [],
    });

    if (fused.length === 0) {
      return noContextResult();
    }

    // 3. Rerank với Cohere → top K, LỌC theo ngưỡng relevance.
    const rerankResults = await this.cohere.rerank(
      query,
      fused.map((c) => c.content),
      this.rerankTop,
    );
    // Khi Cohere lỗi/thiếu key, fallback trả relevanceScore=0 cho mọi kết quả ⇒
    // bỏ qua cổng điểm để không chặn nhầm; lúc đó dựa vào cổng compression + prompt.
    const hasScores = rerankResults.some((r) => r.relevanceScore > 0);
    const keptResults = hasScores
      ? rerankResults.filter((r) => r.relevanceScore >= this.rerankMinScore)
      : rerankResults;
    const topK = keptResults.map((r) => fused[r.index]);

    // Cổng A: không còn đoạn nào đủ liên quan ⇒ báo "chưa đề cập", không gọi LLM.
    if (topK.length === 0) {
      this.logger.debug(
        `RAG gate: no chunk above relevance ${this.rerankMinScore} for query`,
      );
      return noContextResult();
    }

    // 4. Compression — Gemini trích đoạn liên quan
    const compressed = await this.compress(
      query,
      topK.map((c) => c.content),
    );

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
      query,
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

  private async queryRewrite(
    query: string,
    history: string[],
  ): Promise<string[]> {
    try {
      const text = await this.gemini.generate(
        buildQueryRewritePrompt(query, history),
        { temperature: 0.5, maxOutputTokens: 256 },
      );
      return text
        .split(/\r?\n/)
        .map((s) => s.replace(/^[\d\-*\.\s]+/, '').trim())
        .filter((s) => s.length > 3)
        .slice(0, 3);
    } catch (err) {
      this.logger.warn(
        `Query rewrite failed, using original only: ${(err as Error).message}`,
      );
      return [];
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
