import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../gemini.service';
import { CohereService } from '../cohere.service';
import { VectorStoreService, RetrievedChunk } from '../vector/vector-store.service';
import {
  SYSTEM_INSTRUCTION,
  buildAnswerPrompt,
  buildCompressionPrompt,
  buildQueryRewritePrompt,
} from './prompts';

export interface Citation {
  chunkId: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  materialId: string | null;
  lessonId: string | null;
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

  constructor(
    private gemini: GeminiService,
    private cohere: CohereService,
    private vector: VectorStoreService,
    config: ConfigService,
  ) {
    this.retrieveTop = config.get<number>('RAG_RETRIEVE_TOP', 50);
    this.rerankTop = config.get<number>('RAG_RERANK_TOP', 5);
  }

  async ask(
    courseId: string,
    query: string,
    conversationHistory: string[] = [],
  ): Promise<AskResult> {
    // 1. Query rewrite — sinh các biến thể truy vấn
    const rewrites = await this.queryRewrite(query, conversationHistory);
    const allQueries = unique([query, ...rewrites]).slice(0, 3);

    // 2. Embed song song + hybrid search song song
    const embeddings = await this.gemini.embedBatch(allQueries);
    const pools = await Promise.all(
      allQueries.map((q, i) =>
        this.vector.hybridSearch(courseId, embeddings[i], q, this.retrieveTop),
      ),
    );
    const fused = reciprocalRankFusion(pools, this.retrieveTop);

    if (fused.length === 0) {
      return {
        stream: emptyStream('Tài liệu khóa học chưa đề cập đến nội dung này.'),
        citations: [],
        contextChunks: [],
      };
    }

    // 3. Rerank với Cohere → top K
    const rerankResults = await this.cohere.rerank(
      query,
      fused.map((c) => c.content),
      this.rerankTop,
    );
    const topK = rerankResults.map((r) => fused[r.index]);

    // 4. Compression — Gemini trích đoạn liên quan
    const compressed = await this.compress(query, topK.map((c) => c.content));

    // 5. Generate answer
    const citations: Citation[] = topK.map((c) => ({
      chunkId: c.id,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      materialId: c.materialId,
      lessonId: c.lessonId,
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

  private async queryRewrite(query: string, history: string[]): Promise<string[]> {
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
      this.logger.warn(`Query rewrite failed, using original only: ${(err as Error).message}`);
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
      this.logger.warn(`Compression failed, using raw chunks: ${(err as Error).message}`);
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

async function* emptyStream(msg: string): AsyncGenerator<string> {
  yield msg;
}
