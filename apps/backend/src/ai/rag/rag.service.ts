import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import { CohereService } from '../providers/cohere.service';
import {
  VectorStoreService,
  RetrievedChunk,
  ChunkScope,
} from '../vector/vector-store.service';
import { GraphRetrieverService } from '../lightrag/graph-retriever.service';
import {
  SYSTEM_INSTRUCTION,
  NO_CONTEXT_MESSAGE,
  QUIZ_EXPLAIN_SYSTEM_INSTRUCTION,
  buildAnswerPrompt,
  buildCompressionPrompt,
  buildQueryAnalysisPrompt,
  buildQuizExplainPrompt,
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
  private readonly lightragEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    private cohere: CohereService,
    private vector: VectorStoreService,
    private graph: GraphRetrieverService,
    config: ConfigService,
  ) {
    this.retrieveTop = config.get<number>('RAG_RETRIEVE_TOP', 50);
    this.rerankTop = config.get<number>('RAG_RERANK_TOP', 5);
    this.rerankMinScore = config.get<number>('RAG_RERANK_MIN_SCORE', 0.3);
    // Cờ tắt nhanh nguồn graph (LightRAG) để A/B với baseline thuần vector.
    this.lightragEnabled =
      config.get<string>('LIGHTRAG_ENABLED', 'true') !== 'false';
  }

  async ask(
    courseId: string,
    query: string,
    conversationHistory: string[] = [],
    scope?: ChunkScope,
  ): Promise<AskResult> {
    // 1. Query analysis — phân tích intent + sinh biến thể
    const analysis = await this.analyzeQuery(query, conversationHistory);
    const allQueries = unique([
      analysis.resolvedQuery,
      ...analysis.variants,
    ]).slice(0, 4);
    this.logger.log(
      `[RAG] original: "${query}" | intent: ${analysis.intent} | subject: "${analysis.subject}"`,
    );
    this.logger.log(`[RAG] resolvedQuery: "${analysis.resolvedQuery}"`);
    this.logger.log(
      `[RAG] search queries:\n${allQueries.map((q, i) => `  [${i}] ${q}`).join('\n')}`,
    );

    // 2. Embed + truy hồi song song: vector+BM25 (nhiều biến thể) VÀ đồ thị LightRAG
    //    dual-level. Cả hai trả về pool ứng viên chunk → hợp nhất bằng RRF.
    const embeddings = await this.gemini.embedBatch(allQueries);
    const [pools, graphResult] = await Promise.all([
      Promise.all(
        allQueries.map((q, i) =>
          this.vector.hybridSearch(
            courseId,
            embeddings[i],
            q,
            this.retrieveTop,
            scope,
          ),
        ),
      ),
      this.lightragEnabled
        ? this.graph
            .retrieve(
              courseId,
              analysis.lowLevelKeywords,
              analysis.highLevelKeywords,
              scope,
            )
            .catch((err) => {
              this.logger.warn(
                `[RAG] graph retrieve failed, vector-only: ${(err as Error).message}`,
              );
              return null;
            })
        : Promise.resolve(null),
    ]);

    const graphPool = graphResult?.chunks ?? [];
    const allPools = graphPool.length > 0 ? [...pools, graphPool] : pools;
    const fused = reciprocalRankFusion(allPools, this.retrieveTop);
    this.logger.log(
      `[RAG] fused pool: ${fused.length} chunks (vector pools=${pools.length}, graph chunks=${graphPool.length})`,
    );
    fused
      .slice(0, 10)
      .forEach((c, i) =>
        this.logger.log(
          `  [${i}] score=${c.score.toFixed(4)} | ${c.content.slice(0, 80).replace(/\n/g, ' ')}`,
        ),
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
      this.logger.log(
        `  [${i}] score=${r.relevanceScore.toFixed(4)} | ${fused[r.index].content.slice(0, 80).replace(/\n/g, ' ')}`,
      ),
    );
    const topK = rerankResults.map((r) => fused[r.index]);

    // 4. Compression — Gemini trích đoạn liên quan
    const compressed = await this.compress(
      analysis.resolvedQuery,
      topK.map((c) => c.content),
    );

    this.logger.log(
      `[RAG] compressed context (${compressed.length} chars):\n${compressed.slice(0, 300).replace(/\n/g, ' ')}`,
    );
    // Cổng B: compression không tìm thấy đoạn liên quan nào ⇒ "chưa đề cập".
    if (!compressed.trim()) {
      this.logger.debug('RAG gate: compression returned empty context');
      return noContextResult();
    }

    // Bơm "graph context" (entity + quan hệ) lên đầu ngữ cảnh để model suy luận
    // multi-hop. Đây là tri thức rút từ chính tài liệu khóa; citation vẫn từ chunk.
    const finalContext = graphResult?.graphContext
      ? `[Tri thức quan hệ rút từ tài liệu]\n${graphResult.graphContext}\n\n[Trích đoạn nguồn]\n${compressed}`
      : compressed;

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
      finalContext,
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

  /**
   * Giải thích đáp án một câu quiz ôn tập. Khác `ask`: bằng chứng là các CourseChunk
   * THẬT (nạp theo ID đã lưu lúc sinh quiz, fallback hybridSearch nếu trống) → rerank
   * chọn vài đoạn liên quan nhất → sinh giải thích bám đáp án đúng. Không từ chối kiểu
   * "chưa đề cập".
   */
  async explainQuizAnswer(input: {
    courseId: string;
    scope?: ChunkScope;
    questionText: string;
    optionsLabeled: { label: string; content: string }[];
    correctLabels: string[];
    pickedLabels: string[];
    verdict: string;
    storedExplanation?: string | null;
    chunkIds: string[];
  }): Promise<{ stream: AsyncIterable<string>; citations: Citation[] }> {
    const TOP_K = 3;

    // 1. Nạp chunk nguồn thật theo ID đã lưu; fallback hybridSearch theo scope.
    let candidates: RetrievedChunk[] = [];
    if (input.chunkIds.length > 0) {
      const rows = await this.prisma.courseChunk.findMany({
        where: { id: { in: input.chunkIds } },
        select: {
          id: true,
          content: true,
          sectionTitle: true,
          pageNumber: true,
          sectionId: true,
          lessonId: true,
        },
      });
      candidates = rows.map((r) => ({
        id: r.id,
        content: r.content,
        sectionTitle: r.sectionTitle,
        pageNumber: r.pageNumber,
        sectionId: r.sectionId,
        lessonId: r.lessonId,
        sourceType: '',
        score: 0,
      }));
    }
    if (candidates.length === 0) {
      try {
        const embedding = await this.gemini.embedQuery(input.questionText);
        candidates = await this.vector.hybridSearch(
          input.courseId,
          embedding,
          input.questionText,
          this.retrieveTop,
          input.scope,
        );
      } catch (err) {
        this.logger.warn(
          `Quiz explain: fallback retrieval failed: ${(err as Error).message}`,
        );
        candidates = [];
      }
    }

    // 2. Rerank chọn TOP_K đoạn sát câu hỏi nhất.
    let selected = candidates.slice(0, TOP_K);
    if (candidates.length > TOP_K) {
      const reranked = await this.cohere.rerank(
        input.questionText,
        candidates.map((c) => c.content),
        TOP_K,
      );
      selected = reranked.map((r) => candidates[r.index]);
    }

    // 3. Citations + prompt giải thích.
    const citations: Citation[] = selected.map((c) => ({
      chunkId: c.id,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      sectionId: c.sectionId,
      lessonId: c.lessonId,
      excerpt: truncateExcerpt(c.content),
    }));
    const prompt = buildQuizExplainPrompt({
      questionContent: input.questionText,
      optionsLabeled: input.optionsLabeled,
      correctLabels: input.correctLabels,
      pickedLabels: input.pickedLabels,
      verdict: input.verdict,
      storedExplanation: input.storedExplanation,
      evidenceChunks: selected.map((c) => c.content),
      citations: selected.map((c, i) => ({
        index: i,
        sectionTitle: c.sectionTitle,
        pageNumber: c.pageNumber,
      })),
    });
    const stream = this.gemini.generateStream(prompt, {
      systemInstruction: QUIZ_EXPLAIN_SYSTEM_INSTRUCTION,
      temperature: 0.3,
    });

    return { stream, citations };
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
      lowLevelKeywords: [query],
      highLevelKeywords: [],
    };
    try {
      const text = await this.gemini.generate(
        buildQueryAnalysisPrompt(query, history),
        { temperature: 0.1, maxOutputTokens: 640 },
      );
      const json = text.replace(/```(?:json)?|```/g, '').trim();
      const parsed = JSON.parse(json) as QueryAnalysis;
      if (
        !parsed.resolvedQuery ||
        !Array.isArray(parsed.variants) ||
        parsed.variants.length < 3
      ) {
        return fallback;
      }
      // Dual-level keywords là tùy chọn ở output model — chuẩn hóa về mảng string.
      parsed.lowLevelKeywords = toStringArray(parsed.lowLevelKeywords, [
        parsed.subject || query,
      ]);
      parsed.highLevelKeywords = toStringArray(parsed.highLevelKeywords, []);
      return parsed;
    } catch (err) {
      this.logger.warn(
        `Query analysis failed, using original: ${(err as Error).message}`,
      );
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

/** Chuẩn hóa giá trị model trả về thành mảng string sạch; rỗng thì dùng fallback. */
function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .map((v) => String(v ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
  return out.length > 0 ? out : fallback;
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
