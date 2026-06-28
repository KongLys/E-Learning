import { RunRecord, RetrievalSummary } from './types';

/**
 * Metric truy hồi tính phía TypeScript (có sẵn ground-truth chunk id, không cần
 * LLM). RAGAS (faithfulness/answer_relevancy/...) tính riêng ở score.py.
 *
 * Quy ước: "relevant" = chunk id thuộc tập ground-truth của câu hỏi. Với RAPTOR,
 * retrievedChunkIds đã được map từ node về leaf chunk id nên so sánh đồng nhất.
 */

/** Recall@K: tỉ lệ ground-truth chunk được tìm thấy trong top-K đã truy hồi. */
function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = retrieved.slice(0, k);
  let hit = 0;
  for (const id of relevant) if (top.includes(id)) hit++;
  return hit / relevant.size;
}

/** Precision@K: tỉ lệ item trong top-K thực sự liên quan. */
function precisionAtK(
  retrieved: string[],
  relevant: Set<string>,
  k: number,
): number {
  const top = retrieved.slice(0, k);
  if (top.length === 0) return 0;
  let hit = 0;
  for (const id of top) if (relevant.has(id)) hit++;
  return hit / top.length;
}

/** MRR: nghịch đảo thứ hạng của item liên quan ĐẦU TIÊN. */
function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/** nDCG@K với gain nhị phân (relevant = 1). */
function ndcgAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const top = retrieved.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    if (relevant.has(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  // IDCG: trường hợp lý tưởng — mọi item liên quan xếp đầu (tối đa k).
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

/** Tổng hợp metric retrieval cho toàn bộ bản ghi của MỘT phương pháp. */
export function summarizeRetrieval(
  method: string,
  records: RunRecord[],
  k: number,
): RetrievalSummary {
  const n = records.length || 1;
  let recall = 0;
  let mrr = 0;
  let ndcg = 0;
  let precision = 0;
  let hits = 0;
  let latency = 0;
  let llmCalls = 0;

  for (const r of records) {
    const relevant = new Set(r.relevantChunkIds);
    recall += recallAtK(r.retrievedChunkIds, relevant, k);
    mrr += reciprocalRank(r.retrievedChunkIds, relevant);
    ndcg += ndcgAtK(r.retrievedChunkIds, relevant, k);
    precision += precisionAtK(r.retrievedChunkIds, relevant, k);
    if (r.retrievedChunkIds.slice(0, k).some((id) => relevant.has(id))) hits++;
    latency += r.latencyMs;
    llmCalls += r.llmCalls;
  }

  return {
    method,
    n: records.length,
    recallAtK: recall / n,
    mrr: mrr / n,
    ndcgAtK: ndcg / n,
    precisionAtK: precision / n,
    hitRate: hits / n,
    avgLatencyMs: latency / n,
    avgLlmCalls: llmCalls / n,
  };
}

/** Bảng markdown so sánh các phương pháp theo metric retrieval. */
export function summariesToMarkdown(
  summaries: RetrievalSummary[],
  k: number,
): string {
  const head = `| Method | n | Recall@${k} | MRR | nDCG@${k} | Precision@${k} | HitRate | Latency(ms) | LLM calls |\n|---|---|---|---|---|---|---|---|---|`;
  const rows = summaries.map(
    (s) =>
      `| ${s.method} | ${s.n} | ${s.recallAtK.toFixed(3)} | ${s.mrr.toFixed(3)} | ${s.ndcgAtK.toFixed(3)} | ${s.precisionAtK.toFixed(3)} | ${s.hitRate.toFixed(3)} | ${Math.round(s.avgLatencyMs)} | ${s.avgLlmCalls.toFixed(1)} |`,
  );
  return [head, ...rows].join('\n');
}

/** Cùng dữ liệu, xuất CSV để vẽ biểu đồ. */
export function summariesToCsv(summaries: RetrievalSummary[]): string {
  const head =
    'method,n,recall_at_k,mrr,ndcg_at_k,precision_at_k,hit_rate,avg_latency_ms,avg_llm_calls';
  const rows = summaries.map(
    (s) =>
      `${s.method},${s.n},${s.recallAtK.toFixed(4)},${s.mrr.toFixed(4)},${s.ndcgAtK.toFixed(4)},${s.precisionAtK.toFixed(4)},${s.hitRate.toFixed(4)},${Math.round(s.avgLatencyMs)},${s.avgLlmCalls.toFixed(2)}`,
  );
  return [head, ...rows].join('\n');
}
