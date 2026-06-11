/**
 * Script chạy một lần: đẩy toàn bộ bài học có nội dung (mô tả hoặc documentAsset)
 * vào hàng đợi `lesson-indexing` để vector hóa lại — dùng sau migration
 * `lesson_ai_toc_pipeline` (đã xóa sạch course_chunks).
 *
 * Cách chạy (từ apps/backend, cần Redis + Postgres đang chạy):
 *   npx ts-node scripts/reindex-lessons.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

// Nạp .env tối giản (script chạy ngoài Nest nên không có @nestjs/config)
try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // không có .env — dùng biến môi trường sẵn có
}

async function main() {
  const prisma = new PrismaClient();
  const parsed = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const queue = new Queue('lesson-indexing', {
    connection: {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      password: parsed.password || undefined,
      db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0,
    },
  });

  const lessons = await prisma.lesson.findMany({
    where: {
      OR: [{ description: { not: null } }, { documentAsset: { isNot: null } }],
    },
    select: { id: true, title: true },
  });
  console.log(`Enqueueing ${lessons.length} lessons for re-indexing…`);
  for (const l of lessons) {
    await queue.add(
      'index',
      { lessonId: l.id },
      { removeOnComplete: true, removeOnFail: 50 },
    );
  }

  await queue.close();
  await prisma.$disconnect();
  console.log('Done — theo dõi log backend để xem tiến trình index.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
