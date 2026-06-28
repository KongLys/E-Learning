/**
 * Sinh báo cáo HTML trực quan từ kết quả benchmark trong results/.
 * Gộp metric retrieval (retrieval-summary.csv) + RAGAS (ragas-summary.csv, nếu có)
 * + drill-down từng câu hỏi (<method>.jsonl). Biểu đồ vẽ bằng SVG/CSS thuần nên
 * file HTML mở offline, không cần internet/CDN.
 *
 * Chạy (từ apps/backend, sau khi đã có run.ts + score.py):
 *   npx ts-node benchmark/report.ts
 *   → results/report.html  (mở bằng trình duyệt)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const RESULTS = join(__dirname, 'results');

interface Row {
  method: string;
  [metric: string]: string | number;
}

/** Hướng tốt của metric: true = cao hơn tốt hơn, false = thấp hơn tốt hơn. */
const HIGHER_BETTER: Record<string, boolean> = {
  recall_at_k: true,
  mrr: true,
  ndcg_at_k: true,
  precision_at_k: true,
  hit_rate: true,
  faithfulness: true,
  answer_relevancy: true,
  context_precision: true,
  llm_context_precision_with_reference: true,
  context_recall: true,
  avg_latency_ms: false,
  avg_llm_calls: false,
};

/** Nhãn đẹp cho cột metric. */
const LABELS: Record<string, string> = {
  recall_at_k: 'Recall@k',
  mrr: 'MRR',
  ndcg_at_k: 'nDCG@k',
  precision_at_k: 'Precision@k',
  hit_rate: 'Hit rate',
  avg_latency_ms: 'Latency (ms)',
  avg_llm_calls: 'LLM calls',
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer relevancy',
  context_precision: 'Context precision',
  llm_context_precision_with_reference: 'Context precision',
  context_recall: 'Context recall',
};

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, 'utf8').trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(',');
  return lines.filter(Boolean).map((line) => {
    const vals = line.split(',');
    const row: Row = { method: '' };
    cols.forEach((c, i) => {
      const v = vals[i];
      row[c] = c === 'method' ? v : Number(v);
    });
    return row;
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Gộp 2 nguồn metric theo method. */
function merge(retrieval: Row[], ragas: Row[]): { rows: Row[]; metrics: string[] } {
  const byMethod = new Map<string, Row>();
  for (const r of retrieval) byMethod.set(r.method, { ...r });
  for (const r of ragas) {
    const existing = byMethod.get(r.method) ?? { method: r.method };
    byMethod.set(r.method, { ...existing, ...r });
  }
  const rows = [...byMethod.values()];
  // Thứ tự cột metric: retrieval trước, RAGAS sau; bỏ method/n.
  const order = [
    'recall_at_k',
    'mrr',
    'ndcg_at_k',
    'precision_at_k',
    'hit_rate',
    'faithfulness',
    'answer_relevancy',
    'context_precision',
    'llm_context_precision_with_reference',
    'context_recall',
    'avg_latency_ms',
    'avg_llm_calls',
  ];
  const present = order.filter((m) => rows.some((r) => typeof r[m] === 'number'));
  return { rows, metrics: present };
}

/** Tìm best/worst của một cột để tô màu + vẽ bar. */
function extent(rows: Row[], metric: string) {
  const vals = rows
    .map((r) => r[metric])
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const higher = HIGHER_BETTER[metric] ?? true;
  return { min, max, best: higher ? max : min, worst: higher ? min : max };
}

function fmt(v: number, metric: string): string {
  if (metric === 'avg_latency_ms') return Math.round(v).toString();
  if (metric === 'avg_llm_calls') return v.toFixed(1);
  return v.toFixed(3);
}

// ─── Dựng các khối HTML ──────────────────────────────────────────────────────────

function tableHtml(rows: Row[], metrics: string[]): string {
  const head =
    '<tr><th>Phương pháp</th>' +
    metrics.map((m) => `<th>${LABELS[m] ?? m}</th>`).join('') +
    '</tr>';
  const ext = Object.fromEntries(metrics.map((m) => [m, extent(rows, m)]));
  const body = rows
    .map((r) => {
      const cells = metrics
        .map((m) => {
          const v = r[m];
          if (typeof v !== 'number' || Number.isNaN(v))
            return '<td class="na">–</td>';
          const e = ext[m];
          let cls = '';
          if (v === e.best && e.best !== e.worst) cls = 'best';
          else if (v === e.worst && e.best !== e.worst) cls = 'worst';
          return `<td class="${cls}">${fmt(v, m)}</td>`;
        })
        .join('');
      return `<tr><td class="method">${esc(r.method)}</td>${cells}</tr>`;
    })
    .join('');
  return `<table class="metrics">${head}${body}</table>`;
}

function barsHtml(rows: Row[], metrics: string[]): string {
  return metrics
    .map((m) => {
      const e = extent(rows, m);
      const span = e.max - e.min || 1;
      const bars = rows
        .map((r) => {
          const v = r[m];
          if (typeof v !== 'number' || Number.isNaN(v)) return '';
          // Chuẩn hóa chiều dài bar theo min..max; metric thấp-hơn-tốt vẫn vẽ theo
          // độ lớn, nhưng tô xanh cho "best".
          const pct = ((v - e.min) / span) * 100;
          const isBest = v === e.best && e.best !== e.worst;
          return `
            <div class="barrow">
              <span class="barlabel">${esc(r.method)}</span>
              <span class="bartrack"><span class="bar ${isBest ? 'barbest' : ''}" style="width:${Math.max(2, pct).toFixed(1)}%"></span></span>
              <span class="barval">${fmt(v, m)}</span>
            </div>`;
        })
        .join('');
      const dir = (HIGHER_BETTER[m] ?? true) ? 'cao hơn = tốt hơn' : 'thấp hơn = tốt hơn';
      return `<div class="chart"><h3>${LABELS[m] ?? m} <small>(${dir})</small></h3>${bars}</div>`;
    })
    .join('');
}

interface Rec {
  questionId: string;
  type?: string;
  question: string;
  answer: string;
  relevantChunkIds: string[];
  retrievedChunkIds: string[];
  contexts: string[];
}

/** Nhãn tiếng Việt cho loại câu hỏi. */
const TYPE_LABELS: Record<string, string> = {
  single: 'Đơn bước',
  'multi-concrete': 'Đa bước cụ thể',
  'multi-abstract': 'Đa bước trừu tượng',
  'lesson-summary': 'Tóm tắt bài',
  'section-summary': 'Tóm tắt phần',
  'course-summary': 'Tóm tắt khóa',
  'topic-single': 'Chủ đề 1 bài',
  'topic-multi': 'Chủ đề nhiều bài',
  unknown: 'Không rõ loại',
};
const TYPE_ORDER = [
  'single',
  'multi-concrete',
  'multi-abstract',
  'lesson-summary',
  'section-summary',
  'course-summary',
  'topic-single',
  'topic-multi',
  'unknown',
];

/**
 * Tính Recall@k theo (phương pháp × loại câu hỏi) từ *.jsonl, rồi vẽ mỗi loại một
 * biểu đồ cột so sánh các phương pháp. Cho thấy điểm mạnh từng kỹ thuật theo độ khó.
 */
function perTypeHtml(k: number): string {
  const files = readdirSync(RESULTS).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) return '';
  // data[type][method] = { recallSum, n }
  const data = new Map<string, Map<string, { recall: number; n: number }>>();
  const methods: string[] = [];
  for (const f of files) {
    const method = f.replace(/\.jsonl$/, '');
    methods.push(method);
    const recs: Array<{
      type?: string;
      relevantChunkIds: string[];
      retrievedChunkIds: string[];
    }> = readFileSync(join(RESULTS, f), 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    for (const r of recs) {
      const t = r.type ?? 'unknown';
      const rel = new Set(r.relevantChunkIds);
      const top = r.retrievedChunkIds.slice(0, k);
      const recall = rel.size
        ? [...rel].filter((id) => top.includes(id)).length / rel.size
        : 0;
      if (!data.has(t)) data.set(t, new Map());
      const m = data.get(t)!;
      const cur = m.get(method) ?? { recall: 0, n: 0 };
      cur.recall += recall;
      cur.n += 1;
      m.set(method, cur);
    }
  }
  const types = TYPE_ORDER.filter((t) => data.has(t));
  const charts = types
    .map((t) => {
      const m = data.get(t)!;
      const vals = methods.map((me) => ({
        method: me,
        v: (m.get(me)?.recall ?? 0) / (m.get(me)?.n || 1),
      }));
      const max = Math.max(...vals.map((x) => x.v), 0.0001);
      const best = Math.max(...vals.map((x) => x.v));
      const n = m.get(methods[0])?.n ?? 0;
      const bars = vals
        .map(
          (x) => `
          <div class="barrow">
            <span class="barlabel">${esc(x.method)}</span>
            <span class="bartrack"><span class="bar ${x.v === best && best > 0 ? 'barbest' : ''}" style="width:${Math.max(2, (x.v / max) * 100).toFixed(1)}%"></span></span>
            <span class="barval">${x.v.toFixed(3)}</span>
          </div>`,
        )
        .join('');
      return `<div class="chart"><h3>${TYPE_LABELS[t] ?? t} <small>(Recall@${k}, ${n} câu)</small></h3>${bars}</div>`;
    })
    .join('');
  return `<section><h2>Recall theo loại câu hỏi</h2>
    <div class="legend" style="margin-bottom:12px">Đơn bước thiên về vector/hybrid; đa bước trừu tượng là nơi LightRAG/RAPTOR thể hiện thế mạnh tổng hợp.</div>
    <div class="charts">${charts}</div></section>`;
}

function drilldownHtml(k: number): string {
  const files = readdirSync(RESULTS).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) return '';
  const blocks = files
    .map((f) => {
      const method = f.replace(/\.jsonl$/, '');
      const recs: Rec[] = readFileSync(join(RESULTS, f), 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const items = recs
        .map((r) => {
          const rel = new Set(r.relevantChunkIds);
          // hit@k = chunk vàng trong TOP-k (khớp bảng điểm). Badge dùng định nghĩa
          // này để nhất quán với Recall@k/HitRate — KHÔNG dùng "phủ toàn bộ".
          const hit = r.retrievedChunkIds
            .slice(0, k)
            .filter((id) => rel.has(id)).length;
          const ok = hit > 0;
          const ans = r.answer.length > 500 ? r.answer.slice(0, 500) + '…' : r.answer;
          // Ngữ cảnh đã truy hồi — xem method "lấy nhầm" gì → hiểu vì sao điểm thấp.
          const ctx = (r.contexts ?? [])
            .slice(0, 4)
            .map((c, i) => {
              const t = c.replace(/\s+/g, ' ').trim();
              return `<li>${esc(t.length > 220 ? t.slice(0, 220) + '…' : t)}</li>`;
            })
            .join('');
          return `
            <div class="qitem">
              <div class="qhead"><span class="qbadge ${ok ? 'ok' : 'miss'}">${ok ? 'HIT' : 'MISS'}</span>
                <b>${esc(r.questionId)}</b> · ${esc(r.type ?? '')} · trúng ${hit}/${rel.size} chunk vàng</div>
              <div class="qq">${esc(r.question)}</div>
              <div class="qa">↳ ${esc(ans)}</div>
              ${ctx ? `<details class="qctx"><summary>Ngữ cảnh đã truy hồi (${(r.contexts ?? []).length})</summary><ol>${ctx}</ol></details>` : ''}
            </div>`;
        })
        .join('');
      // 2 con số khác nhau, ghi rõ để tránh hiểu nhầm:
      //  - hit@k: chunk vàng trong top-k (khớp bảng điểm Recall@k/HitRate).
      //  - phủ:   chunk vàng có mặt trong BẤT KỲ đoạn truy hồi (RAPTOR nở nhiều
      //           leaf-chunk nên "phủ" cao nhưng top-k vẫn thấp).
      const n = recs.length || 1;
      const hitAtK =
        recs.filter((r) => {
          const rel = new Set(r.relevantChunkIds);
          return r.retrievedChunkIds.slice(0, k).some((id) => rel.has(id));
        }).length / n;
      const coverage =
        recs.filter((r) => {
          const rel = new Set(r.relevantChunkIds);
          return r.retrievedChunkIds.some((id) => rel.has(id));
        }).length / n;
      return `<details class="dd"><summary>${esc(method)} — ${recs.length} câu · hit@${k} ${(hitAtK * 100).toFixed(0)}% · phủ ${(coverage * 100).toFixed(0)}%</summary>${items}</details>`;
    })
    .join('');
  return `<section><h2>Drill-down theo câu hỏi</h2>
    <div class="legend" style="margin-bottom:12px"><b>hit@${k}</b> = chunk vàng nằm trong top-${k} (khớp bảng điểm). <b>phủ</b> = chunk vàng có mặt trong bất kỳ đoạn truy hồi. RAPTOR nở mỗi node tóm tắt thành nhiều leaf-chunk nên "phủ" cao nhưng hit@${k} thấp — đó là vì sao điểm xếp hạng thấp dù tìm đúng vùng.</div>
    ${blocks}</section>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────────

function main() {
  const retrievalPath = join(RESULTS, 'retrieval-summary.csv');
  if (!existsSync(retrievalPath)) {
    console.error(
      `Không thấy ${retrievalPath}. Chạy benchmark/run.ts trước.`,
    );
    process.exit(1);
  }
  const retrieval = parseCsv(retrievalPath);
  const ragasPath = join(RESULTS, 'ragas-summary.csv');
  const ragas = existsSync(ragasPath) ? parseCsv(ragasPath) : [];
  if (ragas.length === 0) {
    console.warn('(chưa có ragas-summary.csv — báo cáo chỉ gồm metric retrieval)');
  }

  const { rows, metrics } = merge(retrieval, ragas);
  const n = retrieval[0]?.n ?? '?';
  const now = new Date().toLocaleString('vi-VN');
  const kArg = process.argv.indexOf('--k');
  const k = kArg >= 0 ? Number(process.argv[kArg + 1]) : 5;

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Báo cáo Benchmark RAG</title>
<style>
  :root { --bg:#0f1419; --card:#1a2029; --line:#2a323d; --fg:#e6edf3; --muted:#8b98a5;
          --best:#2ea043; --worst:#cf3b3b; --bar:#3b82f6; --barbest:#2ea043; }
  * { box-sizing:border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
         font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif; }
  h1 { margin:0 0 4px; font-size:22px; }
  .sub { color:var(--muted); margin-bottom:20px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px;
            padding:18px 20px; margin-bottom:20px; }
  h2 { margin:0 0 14px; font-size:17px; }
  table.metrics { border-collapse:collapse; width:100%; font-variant-numeric:tabular-nums; }
  table.metrics th, table.metrics td { padding:8px 10px; text-align:right;
            border-bottom:1px solid var(--line); }
  table.metrics th:first-child, table.metrics td.method { text-align:left; }
  table.metrics th { color:var(--muted); font-weight:600; }
  td.method { font-weight:600; }
  td.best { color:#fff; background:rgba(46,160,67,.22); font-weight:700; border-radius:4px; }
  td.worst { color:#fff; background:rgba(207,59,59,.18); }
  td.na { color:var(--muted); }
  .charts { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
  .chart { background:#141a22; border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .chart h3 { margin:0 0 10px; font-size:14px; }
  .chart small { color:var(--muted); font-weight:400; }
  .barrow { display:grid; grid-template-columns:130px 1fr 64px; align-items:center; gap:8px; margin:5px 0; }
  .barlabel { color:var(--muted); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bartrack { background:#0d1117; border-radius:4px; height:14px; overflow:hidden; }
  .bar { display:block; height:100%; background:var(--bar); border-radius:4px; }
  .barbest { background:var(--barbest); }
  .barval { text-align:right; font-variant-numeric:tabular-nums; font-size:12px; }
  details.dd { border:1px solid var(--line); border-radius:8px; margin-bottom:10px; background:#141a22; }
  details.dd summary { cursor:pointer; padding:10px 14px; font-weight:600; }
  .qitem { padding:10px 14px; border-top:1px solid var(--line); }
  .qhead { font-size:12px; color:var(--muted); margin-bottom:4px; }
  .qbadge { padding:1px 6px; border-radius:4px; font-weight:700; color:#fff; }
  .qbadge.ok { background:var(--best); } .qbadge.miss { background:var(--worst); }
  .qq { font-weight:600; margin:2px 0; }
  .qa { color:var(--muted); white-space:pre-wrap; }
  .qctx { margin-top:6px; }
  .qctx summary { cursor:pointer; font-size:12px; color:var(--bar); }
  .qctx ol { margin:6px 0 0; padding-left:20px; color:var(--muted); font-size:12px; }
  .qctx li { margin:3px 0; }
  .legend { color:var(--muted); font-size:12px; margin-top:8px; }
</style></head><body>
  <h1>Báo cáo Benchmark RAG</h1>
  <div class="sub">${n} câu hỏi · ${rows.length} phương pháp · tạo lúc ${esc(now)}</div>

  <section>
    <h2>Bảng tổng hợp</h2>
    ${tableHtml(rows, metrics)}
    <div class="legend">🟩 tốt nhất cột · 🟥 kém nhất cột. Latency & LLM calls: thấp hơn tốt hơn.</div>
  </section>

  <section>
    <h2>So sánh theo metric</h2>
    <div class="charts">${barsHtml(rows, metrics)}</div>
  </section>

  ${perTypeHtml(k)}

  ${drilldownHtml(k)}
</body></html>`;

  const out = join(RESULTS, 'report.html');
  writeFileSync(out, html, 'utf8');
  console.log(`✓ Đã tạo ${out}`);
  console.log('  Mở bằng trình duyệt để xem biểu đồ + bảng so sánh.');
}

main();
