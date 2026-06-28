/**
 * Sinh bộ dữ liệu vàng (golden set) SYNTHETIC bằng LLM, kiểu RAGAS test-set:
 *  - Lấy mẫu các CourseChunk thật của một khóa học.
 *  - Với mỗi chunk (hoặc cụm chunk liền kề), nhờ Gemini sinh 1 câu hỏi mà chunk
 *    đó trả lời được + câu trả lời tham chiếu.
 *  - Ghi nhận chính chunk nguồn làm `relevantChunkIds` (ground-truth retrieval).
 *
 * Đầu ra: benchmark/data/golden-set.draft.json — BẠN PHẢI RÀ SOÁT trước khi dùng
 * (xóa câu mơ hồ, sửa/bổ sung relevantChunkIds nếu câu trả lời trải nhiều chunk).
 *
 * Chạy:
 *   npx ts-node benchmark/generate-golden.ts --course <courseId> --n 60
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { bootstrap } from './bootstrap';
import { GoldenItem } from './types';

interface ChunkRow {
  id: string;
  content: string;
  section_title: string | null;
  lesson_id: string | null;
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function buildGenPrompt(content: string): string {
  return `Dưới đây là một đoạn tài liệu khóa học:
"""
${content.slice(0, 2500)}
"""

Hãy đóng vai học viên và tạo MỘT câu hỏi mà đoạn trên trả lời được trực tiếp, kèm
câu trả lời ngắn gọn dựa HOÀN TOÀN vào đoạn đó. Câu hỏi phải tự nhiên, cụ thể, có
thể hiểu mà không cần nhìn đoạn (không dùng "đoạn trên", "theo tài liệu").

Trả về JSON đúng dạng, không thêm chữ nào khác:
{"question": "...", "answer": "..."}`;
}

async function main() {
  const courseId = arg('course');
  const n = parseInt(arg('n', '50')!, 10);
  if (!courseId) {
    console.error('Thiếu --course <courseId>');
    process.exit(1);
  }

  const deps = await bootstrap();
  try {
    // Lấy chunk thật, bỏ bài quiz, ưu tiên chunk đủ dài để hỏi được.
    const rows = await deps.prisma.$queryRaw<ChunkRow[]>`
      SELECT id, content, section_title, lesson_id
      FROM course_chunks
      WHERE course_id = ${courseId}
        AND length(content) > 300
        AND NOT EXISTS (
          SELECT 1 FROM lessons ql
          WHERE ql.id = course_chunks.lesson_id AND ql.type::text = 'quiz'
        )
      ORDER BY random()
      LIMIT ${n};
    `;
    if (rows.length === 0) {
      console.error(`Khóa ${courseId} không có chunk phù hợp.`);
      process.exit(1);
    }
    console.log(`Đã lấy ${rows.length} chunk. Đang sinh câu hỏi...`);

    const items: GoldenItem[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const raw = await deps.gemini.generate(buildGenPrompt(r.content), {
          temperature: 0.4,
          maxOutputTokens: 512,
        });
        const json = raw.replace(/```(?:json)?|```/g, '').trim();
        const parsed = JSON.parse(json) as { question: string; answer: string };
        if (!parsed.question || !parsed.answer) throw new Error('thiếu trường');
        items.push({
          id: `g${String(i + 1).padStart(3, '0')}`,
          courseId,
          question: parsed.question.trim(),
          groundTruthAnswer: parsed.answer.trim(),
          relevantChunkIds: [r.id],
        });
        process.stdout.write(`\r  ${i + 1}/${rows.length}`);
      } catch (err) {
        console.warn(
          `\n  bỏ qua chunk ${r.id}: ${(err as Error).message}`,
        );
      }
    }

    const outDir = join(__dirname, 'data');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'golden-set.draft.json');
    writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
    console.log(
      `\n✓ Sinh ${items.length} câu hỏi → ${outPath}\n` +
        `  HÃY RÀ SOÁT: xóa câu mơ hồ, bổ sung relevantChunkIds nếu cần,\n` +
        `  rồi đổi tên thành golden-set.json để chạy benchmark.`,
    );
  } finally {
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
