/**
 * Re-index các khóa đã copy sang DB MỚI: sinh lại course_chunks (+ graph LightRAG)
 * và cây RAPTOR. Bootstrap nguyên AppModule nên CHÍNH tiến trình này vừa enqueue
 * job vừa chạy worker tiêu thụ → ghi vào DB mà DATABASE_URL trỏ tới.
 *
 * ⚠️ TRÁNH TRANH CHẤP REDIS: nếu app production đang chạy và DÙNG CHUNG Redis, worker
 * của nó có thể nuốt job và ghi nhầm vào DB cũ. Khi reindex, hãy:
 *   - trỏ DATABASE_URL vào DB MỚI, và
 *   - dùng REDIS_URL RIÊNG (hoặc số db Redis khác, vd .../1), hoặc tắt worker prod.
 *
 * Chạy (từ apps/backend):
 *   DATABASE_URL=postgres://...new  REDIS_URL=redis://localhost:6379/1 \
 *     npx ts-node benchmark/reindex.ts --courses <id1>,<id2>
 */
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { bootstrap } from './bootstrap';
import { LESSON_INDEX_QUEUE } from '../src/ai/processors/lesson-index.processor';
import { GRAPH_EXTRACTION_QUEUE } from '../src/ai/lightrag/graph-extraction.queue';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chờ các queue rút cạn (không còn waiting/active/delayed/paused). */
async function waitDrain(queues: Queue[], label: string, timeoutMs = 30 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let pending = 0;
    for (const q of queues) {
      const c = await q.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'paused',
      );
      pending += (c.waiting ?? 0) + (c.active ?? 0) + (c.delayed ?? 0) + (c.paused ?? 0);
    }
    process.stdout.write(`\r  [${label}] còn ${pending} job   `);
    if (pending === 0) {
      console.log(`\r  [${label}] xong            `);
      return;
    }
    await sleep(3000);
  }
  console.warn(`\n  [${label}] hết thời gian chờ — tiếp tục.`);
}

async function main() {
  const courseIds = (arg('courses') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (courseIds.length === 0) {
    console.error('Cần --courses <id1>,<id2>,...');
    process.exit(1);
  }

  const deps = await bootstrap();
  const lessonQ = deps.app.get<Queue>(getQueueToken(LESSON_INDEX_QUEUE), {
    strict: false,
  });
  const graphQ = deps.app.get<Queue>(getQueueToken(GRAPH_EXTRACTION_QUEUE), {
    strict: false,
  });

  try {
    // 1. Enqueue index cho mọi bài không phải quiz của các khóa.
    const lessons = await deps.prisma.lesson.findMany({
      where: {
        section: { courseId: { in: courseIds } },
        type: { not: 'quiz' },
      },
      select: { id: true },
    });
    console.log(`Enqueue index cho ${lessons.length} bài học...`);
    for (const l of lessons) {
      await lessonQ.add(
        'index',
        { lessonId: l.id },
        { jobId: `reindex-${l.id}`, attempts: 3, backoff: { type: 'exponential', delay: 8000 }, removeOnComplete: true, removeOnFail: 50 },
      );
    }

    // 2. Chờ chunk xong (lesson-index tự enqueue graph), rồi chờ graph xong.
    await waitDrain([lessonQ], 'chunk');
    await waitDrain([graphQ], 'graph');

    // 3. Dựng cây RAPTOR cho từng khóa (force) rồi chờ trạng thái 'ready'.
    //    Khóa rỗng (không có chunk) trả 'empty' và KHÔNG tạo tree row → loại khỏi
    //    danh sách chờ, nếu không vòng lặp sẽ kẹt tới hết timeout.
    const waitRaptor: string[] = [];
    for (const courseId of courseIds) {
      const r = await deps.raptor.ensureReady(courseId, true);
      if (r !== 'empty') waitRaptor.push(courseId);
    }
    if (waitRaptor.length > 0) {
      console.log('Đang dựng RAPTOR...');
      const deadline = Date.now() + 30 * 60_000;
      while (Date.now() < deadline) {
        const trees = await deps.prisma.courseRaptorTree.findMany({
          where: { courseId: { in: waitRaptor } },
          select: { status: true },
        });
        const done = trees.filter(
          (t) => t.status === 'ready' || t.status === 'failed',
        ).length;
        process.stdout.write(`\r  RAPTOR: ${done}/${waitRaptor.length} khóa   `);
        if (done >= waitRaptor.length) break;
        await sleep(3000);
      }
    }
    console.log('\n✓ Re-index hoàn tất.');
    // app.close() đôi khi treo do BullMQ worker/Redis giữ kết nối — đóng best-effort
    // có timeout rồi thoát hẳn để tiến trình không kẹt ở bước shutdown.
    await Promise.race([
      deps.app.close().catch(() => undefined),
      sleep(5000),
    ]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
