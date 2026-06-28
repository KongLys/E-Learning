import { GeminiService } from '../src/ai/providers/gemini.service';
import { CohereService } from '../src/ai/providers/cohere.service';
import {
  VectorStoreService,
  ChunkScope,
  RetrievedChunk,
} from '../src/ai/vector/vector-store.service';
import { GraphRetrieverService } from '../src/ai/lightrag/graph-retriever.service';
import { RaptorService } from '../src/ai/raptor/raptor.service';
import {
  buildQueryAnalysisPrompt,
  buildCompressionPrompt,
  buildAnswerPrompt,
  QueryAnalysis,
} from '../src/ai/rag/prompts';
import { buildStepBackPrompt } from './prompts';
import { RagConfig, GoldenItem, Candidate, RunRecord } from './types';

/** Tham số truy hồi — giữ trùng mặc định của RagService để so sánh công bằng.
 * Pipeline thu hẹp dần: retrieve 50 → rerank 10 → compress 5.
 *  - RETRIEVE_TOP: kích thước pool ứng viên sau RRF.
 *  - RERANK_TOP : số chunk giữ lại sau rerank — đây là tập tính recall (recall@10)
 *    và là contexts đưa cho RAGAS.
 *  - COMPRESS_TOP: chỉ vài chunk hạng đầu được nén + đưa vào sinh câu trả lời. */
const RETRIEVE_TOP = 50;
const RERANK_TOP = 10;
const COMPRESS_TOP = 5;
const RAPTOR_TOP_N = 8;

/**
 * Chạy MỘT phương pháp RAG (RagConfig) trên một câu hỏi, tái dùng đúng các
 * service production. Tách pipeline cứng của RagService thành các tầng bật/tắt:
 *   query-analysis → (multi-query / step-back) → retrieve → RRF → rerank →
 *   compress → generate.
 */
export class BenchmarkRunner {
  constructor(
    private gemini: GeminiService,
    private cohere: CohereService,
    private vector: VectorStoreService,
    private graph: GraphRetrieverService,
    private raptor: RaptorService,
  ) {}

  async runOne(config: RagConfig, item: GoldenItem): Promise<RunRecord> {
    const t0 = Date.now();
    let llmCalls = 0;
    const scope: ChunkScope | undefined = item.scope;

    // 1. Query analysis — luôn chạy: graph cần dual-level keywords, multi-query
    //    cần variants, mọi method cần resolvedQuery.
    const analysis = await this.analyze(item.question);
    llmCalls++;
    const baseQuery = analysis.resolvedQuery || item.question;

    const queries = config.multiQuery
      ? unique([baseQuery, ...analysis.variants]).slice(0, 4)
      : [baseQuery];
    if (config.stepBack) {
      const sb = await this.stepBack(item.question);
      llmCalls++;
      if (sb) queries.push(sb);
    }

    // 2. Truy hồi → pool ứng viên (đã chuẩn hóa về Candidate).
    const pools = await this.retrieve(config, item.courseId, queries, scope);
    const fused = reciprocalRankFusion(pools, RETRIEVE_TOP);

    // 3. Rerank (tùy chọn) → RERANK_TOP. Đây là tập "đã truy hồi" để chấm recall.
    let topK: Candidate[];
    if (config.rerank && fused.length > 0) {
      const reranked = await this.cohere.rerank(
        item.question,
        fused.map((c) => c.content),
        RERANK_TOP,
      );
      topK = reranked.map((r) => fused[r.index]);
    } else {
      topK = fused.slice(0, RERANK_TOP);
    }

    // 4. Thu hẹp còn COMPRESS_TOP chunk hạng đầu để nén + sinh câu trả lời.
    //    contexts (cho RAGAS) = tập sau rerank (RERANK_TOP) — đo chất lượng truy hồi;
    //    câu trả lời + citation chỉ dựa trên các chunk được nén này.
    const contexts = topK.map((c) => c.content);
    const answerChunks = config.compress ? topK.slice(0, COMPRESS_TOP) : topK;
    let answerContext = answerChunks.map((c) => c.content).join('\n\n');
    if (config.compress && answerChunks.length > 0) {
      answerContext = await this.compress(
        baseQuery,
        answerChunks.map((c) => c.content),
      );
      llmCalls++;
    }

    // 5. Sinh câu trả lời (non-stream cho dễ chấm) — citation khớp answerChunks.
    const answer = await this.generate(baseQuery, answerContext, answerChunks);
    llmCalls++;

    // retrievedChunkIds: leaf chunk id theo thứ tự topK (RERANK_TOP), dedup giữ thứ tự.
    const retrievedChunkIds = unique(topK.flatMap((c) => c.leafChunkIds));

    return {
      method: config.name,
      questionId: item.id,
      type: item.type,
      courseId: item.courseId,
      question: item.question,
      groundTruthAnswer: item.groundTruthAnswer,
      relevantChunkIds: item.relevantChunkIds,
      retrievedChunkIds,
      contexts,
      answer,
      latencyMs: Date.now() - t0,
      llmCalls,
    };
  }

  // ─── Truy hồi theo loại retriever ──────────────────────────────────────────────

  private async retrieve(
    config: RagConfig,
    courseId: string,
    queries: string[],
    scope?: ChunkScope,
  ): Promise<Candidate[][]> {
    if (config.retriever === 'graph') {
      const analysis = await this.analyze(queries[0]);
      // KHÔNG nuốt lỗi ở đây: để lỗi DB (vd pooler Supabase rớt → P1001) lan ra
      // run.ts → kích hoạt retry/câu, thay vì âm thầm trả rỗng làm metric về 0 giả.
      // graph.retrieve trả null khi KHÔNG có dữ liệu đồ thị (không phải lỗi) → rỗng.
      const res = await this.graph.retrieve(
        courseId,
        analysis.lowLevelKeywords,
        analysis.highLevelKeywords,
        scope,
      );
      return [chunksToCandidates(res?.chunks ?? [])];
    }

    // vector / hybrid / raptor: embed mọi query → truy hồi từng query → nhiều pool.
    const embeddings = await this.gemini.embedBatch(queries);
    const pools: Candidate[][] = [];
    for (let i = 0; i < queries.length; i++) {
      const emb = embeddings[i];
      if (config.retriever === 'vector') {
        const rows = await this.vector.vectorSearch(
          courseId,
          emb,
          RETRIEVE_TOP,
          scope,
        );
        pools.push(chunksToCandidates(rows));
      } else if (config.retriever === 'hybrid') {
        const rows = await this.vector.hybridSearch(
          courseId,
          emb,
          queries[i],
          RETRIEVE_TOP,
          scope,
        );
        pools.push(chunksToCandidates(rows));
      } else {
        // Có rerank phía sau → drill pool leaf lớn (RETRIEVE_TOP) để rerank có gì
        // mà chọn; không thì giữ pool nhỏ như cũ. Số node ANN cũng nới khi rerank
        // để gom được nhiều vùng hơn trước khi drill.
        const raptorNodes = config.rerank ? 20 : RAPTOR_TOP_N;
        const raptorLeaves = config.rerank ? RETRIEVE_TOP : RAPTOR_TOP_N;
        const items = await this.raptor.collapsedTreeRetrieve(
          courseId,
          emb,
          queries[i],
          raptorNodes,
          scope,
          raptorLeaves,
        );
        pools.push(
          items.map((it) => ({
            id: it.id,
            content: it.content,
            title: it.title,
            pageNumber: null,
            leafChunkIds: it.leafChunkIds,
            score: it.score,
          })),
        );
      }
    }
    return pools;
  }

  // ─── Các bước LLM ──────────────────────────────────────────────────────────────

  private async analyze(question: string): Promise<QueryAnalysis> {
    const fallback: QueryAnalysis = {
      intent: 'other',
      subject: question,
      resolvedQuery: question,
      variants: [question, question, question],
      lowLevelKeywords: [question],
      highLevelKeywords: [],
    };
    try {
      const text = await this.gemini.generate(
        buildQueryAnalysisPrompt(question, []),
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
      parsed.lowLevelKeywords = toStringArray(parsed.lowLevelKeywords, [
        parsed.subject || question,
      ]);
      parsed.highLevelKeywords = toStringArray(parsed.highLevelKeywords, []);
      return parsed;
    } catch {
      return fallback;
    }
  }

  private async stepBack(question: string): Promise<string> {
    try {
      const text = await this.gemini.generate(buildStepBackPrompt(question), {
        temperature: 0.3,
        maxOutputTokens: 128,
      });
      return text.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
    } catch {
      return '';
    }
  }

  private async compress(query: string, chunks: string[]): Promise<string> {
    try {
      return await this.gemini.generate(buildCompressionPrompt(query, chunks), {
        temperature: 0.0,
        maxOutputTokens: 1024,
      });
    } catch {
      return chunks.map((c, i) => `[Đoạn ${i + 1}] ${c}`).join('\n\n');
    }
  }

  private async generate(
    query: string,
    context: string,
    topK: Candidate[],
  ): Promise<string> {
    const prompt = buildAnswerPrompt(
      query,
      context,
      topK.map((c, i) => ({
        index: i,
        sectionTitle: c.title,
        pageNumber: c.pageNumber,
      })),
      [],
    );
    try {
      return await this.gemini.generate(prompt, { temperature: 0.2 });
    } catch {
      return '';
    }
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function chunksToCandidates(chunks: RetrievedChunk[]): Candidate[] {
  return chunks.map((c) => ({
    id: c.id,
    content: c.content,
    title: c.sectionTitle,
    pageNumber: c.pageNumber,
    leafChunkIds: [c.id],
    score: c.score,
  }));
}

/** RRF hợp nhất nhiều pool theo Candidate.id (hằng số 60 chuẩn). */
function reciprocalRankFusion(
  pools: Candidate[][],
  topK: number,
): Candidate[] {
  const scores = new Map<string, { cand: Candidate; score: number }>();
  for (const pool of pools) {
    pool.forEach((cand, rank) => {
      const existing = scores.get(cand.id);
      const contribution = 1 / (60 + rank);
      if (existing) existing.score += contribution;
      else scores.set(cand.id, { cand, score: contribution });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((e) => e.cand);
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .map((v) => String(v ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
  return out.length > 0 ? out : fallback;
}
