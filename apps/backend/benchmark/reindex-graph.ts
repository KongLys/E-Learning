/**
 * Dựng lại CHỈ đồ thị tri thức (graph_entities + graph_relations) cho các khóa —
 * không re-chunk, không dựng RAPTOR. Đọc lại course_chunks đã index nên rẻ.
 *
 * Dùng sau khi áp migration 20260627000000_lightrag_weight_chunkprov (đã TRUNCATE
 * đồ thị + đổi schema sang weight=#bài + chunk-level provenance).
 *
 * Gọi extractLesson TUẦN TỰ (tránh race khi 2 bài cùng upsert một entity).
 *
 * Chạy (từ apps/backend):
 *   npx ts-node benchmark/reindex-graph.ts                 # toàn bộ khóa
 *   npx ts-node benchmark/reindex-graph.ts --courses a,b   # giới hạn khóa
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GraphExtractionService } from '../src/ai/lightrag/graph-extraction.service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main() {
  const filter = (arg('courses') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService, { strict: false });
  const extractor = app.get(GraphExtractionService, { strict: false });

  // Mọi bài KHÔNG phải quiz, trong các khóa (lọc nếu có), đã có chunk để trích.
  const lessons = await prisma.lesson.findMany({
    where: {
      type: { not: 'quiz' },
      ...(filter.length > 0
        ? { section: { courseId: { in: filter } } }
        : {}),
    },
    select: { id: true, section: { select: { courseId: true } } },
    orderBy: { id: 'asc' },
  });

  const courses = new Set(lessons.map((l) => l.section.courseId));
  console.log(
    `[graph-reindex] ${lessons.length} bài (không quiz) / ${courses.size} khóa — bắt đầu.`,
  );

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < lessons.length; i++) {
    const id = lessons[i].id;
    try {
      await extractor.extractLesson(id);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  ✗ lesson ${id}: ${(err as Error).message}`);
    }
    if ((i + 1) % 5 === 0 || i === lessons.length - 1) {
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(
        `\r[graph-reindex] ${i + 1}/${lessons.length} (ok=${ok} fail=${fail}) ${sec}s   `,
      );
    }
  }
  console.log(`\n[graph-reindex] xong: ok=${ok} fail=${fail}.`);

  // Thống kê nhanh đồ thị vừa dựng.
  const [ent, rel] = await Promise.all([
    prisma.graphEntity.count(),
    prisma.graphRelation.count(),
  ]);
  console.log(`[graph-reindex] graph_entities=${ent} graph_relations=${rel}`);

  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
