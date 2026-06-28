/**
 * Chạy benchmark: với mỗi phương pháp (RagConfig) × mỗi câu hỏi golden, thực thi
 * pipeline qua BenchmarkRunner và ghi kết quả.
 *
 * Đầu ra (benchmark/results/):
 *   - <method>.jsonl          : từng RunRecord (Python RAGAS đọc file này)
 *   - retrieval-summary.md/.csv: metric truy hồi tính phía TS
 *
 * Chạy:
 *   npx ts-node benchmark/run.ts                       # tất cả method, golden-set.json
 *   npx ts-node benchmark/run.ts --methods lightrag,raptor-stepback-rerank-compress --k 5 --limit 20
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { bootstrap } from './bootstrap';
import { BenchmarkRunner } from './runner';
import { METHODS, methodByName } from './methods';
import {
  summarizeRetrieval,
  summariesToMarkdown,
  summariesToCsv,
} from './metrics';
import { GoldenItem, RagConfig, RunRecord, RetrievalSummary } from './types';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const goldenPath =
    arg('golden') ?? join(__dirname, 'data', 'golden-set.json');
  const k = parseInt(arg('k', '5')!, 10);
  const limit = arg('limit') ? parseInt(arg('limit')!, 10) : Infinity;
  const methodNames = arg('methods');
  const configs: RagConfig[] = methodNames
    ? methodNames
        .split(',')
        .map((s) => methodByName(s.trim()))
        .filter((m): m is RagConfig => Boolean(m))
    : METHODS;

  let golden: GoldenItem[];
  try {
    golden = (JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenItem[]).slice(
      0,
      limit,
    );
  } catch (err) {
    console.error(`Không đọc được golden set ${goldenPath}: ${(err as Error).message}`);
    console.error('Chạy generate-golden.ts trước, rồi đổi tên thành golden-set.json.');
    process.exit(1);
    return;
  }

  console.log(
    `Golden: ${golden.length} câu | Methods: ${configs.map((c) => c.name).join(', ')} | k=${k}`,
  );

  const deps = await bootstrap();
  const runner = new BenchmarkRunner(
    deps.gemini,
    deps.cohere,
    deps.vector,
    deps.graph,
    deps.raptor,
  );

  const outDir = join(__dirname, 'results');
  mkdirSync(outDir, { recursive: true });
  const summaries: RetrievalSummary[] = [];

  try {
    for (const config of configs) {
      const file = join(outDir, `${config.name}.jsonl`);
      writeFileSync(file, '', 'utf8'); // reset
      const records: RunRecord[] = [];
      console.log(`\n▶ ${config.name}`);

      for (let i = 0; i < golden.length; i++) {
        const item = golden[i];
        // Retry/câu: Supabase pooler thỉnh thoảng rớt vài giây (P1001) trong run
        // dài — thử lại với backoff để không mất record (tránh metric về 0 giả).
        let rec: RunRecord | undefined;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            rec = await runner.runOne(config, item);
            break;
          } catch (err) {
            lastErr = err;
            await sleep(3000 * (attempt + 1));
          }
        }
        if (rec) {
          records.push(rec);
          appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
          process.stdout.write(
            `\r  ${i + 1}/${golden.length}  (${rec.latencyMs}ms)`,
          );
        } else {
          console.warn(
            `\n  lỗi câu ${item.id} (bỏ qua sau 4 lần): ${(lastErr as Error)?.message || lastErr}`,
          );
        }
      }

      const summary = summarizeRetrieval(config.name, records, k);
      summaries.push(summary);
      console.log(
        `\n  Recall@${k}=${summary.recallAtK.toFixed(3)} MRR=${summary.mrr.toFixed(3)} nDCG@${k}=${summary.ndcgAtK.toFixed(3)}`,
      );
    }

    const md = summariesToMarkdown(summaries, k);
    writeFileSync(join(outDir, 'retrieval-summary.md'), md + '\n', 'utf8');
    writeFileSync(
      join(outDir, 'retrieval-summary.csv'),
      summariesToCsv(summaries) + '\n',
      'utf8',
    );
    console.log(`\n\n=== Retrieval metrics ===\n${md}`);
    console.log(`\nĐã ghi kết quả vào ${outDir}`);
    console.log('Tiếp theo: python benchmark/score.py  (chấm RAGAS từ *.jsonl)');
  } finally {
    // app.close() đôi khi treo do BullMQ worker/Redis — đóng best-effort có timeout
    // rồi thoát hẳn để script không kẹt ở bước shutdown.
    await Promise.race([
      deps.app.close().catch(() => undefined),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
