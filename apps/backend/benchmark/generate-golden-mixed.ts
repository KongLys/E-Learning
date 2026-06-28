/**
 * Sinh golden-set HỖN HỢP cho MỘT khóa học theo 8 kiểu câu hỏi, phân bố mặc định
 * 75 câu (override qua --counts):
 *   - single         : đơn bước, trả lời được bằng 1 chunk (factoid).            [18]
 *   - multi-concrete : đa bước cụ thể — kết hợp nhiều chunk LIỀN NHAU cùng bài.  [18]
 *   - multi-abstract : đa bước trừu tượng — tổng hợp/so sánh qua nhiều bài cùng phần. [18]
 *   - lesson-summary : tóm tắt nội dung một BÀI (GT = mọi chunk của bài).         [5]
 *   - section-summary: tóm tắt nội dung một PHẦN (GT = mọi chunk của phần).       [5]
 *   - course-summary : tóm tắt toàn KHÓA (GT = tập chunk đại diện trải các phần). [1]
 *   - topic-single   : tóm tắt một CHỦ ĐỀ (GraphEntity) gói trong 1 bài.          [5]
 *   - topic-multi    : tóm tắt một CHỦ ĐỀ trải NHIỀU bài (đúng thế mạnh đồ thị).  [5]
 *
 * Ground-truth (relevantChunkIds):
 *   - single/multi      : chính (các) chunk nguồn.
 *   - lesson/section/course-summary : chunk của bài/phần/khóa (course cap ~40 chunk).
 *   - topic-*           : GraphEntity.chunkIds (đã lọc chunk hợp lệ).
 * → chuẩn vàng cho metric truy hồi. RAPTOR/LightRAG mạnh ở các câu tóm tắt/topic-multi
 *   vì map một node tóm tắt về nhiều chunk lá.
 *
 * Đầu ra: benchmark/data/golden-set.draft.json — RÀ SOÁT tay rồi đổi tên thành
 * golden-set.json trước khi chạy run.ts.
 *
 * Chạy (từ apps/backend):
 *   npx ts-node benchmark/generate-golden-mixed.ts --course <id>
 *   npx ts-node benchmark/generate-golden-mixed.ts --course <id> --counts single=10,topic-multi=8
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { bootstrap } from './bootstrap';
import { GoldenItem, QuestionType } from './types';

interface ChunkRow {
  id: string;
  lesson_id: string | null;
  section_id: string | null;
  chunk_index: number;
  content: string;
}
interface LessonRow {
  id: string;
  title: string;
  section_id: string;
}
interface SectionRow {
  id: string;
  title: string;
}
interface RaptorRow {
  id: string;
  level: number;
  lesson_id: string | null;
  section_id: string | null;
  title: string | null;
  content: string;
}
interface EntityRow {
  name: string;
  description: string;
  lesson_ids: string[];
  chunk_ids: string[];
  degree: number;
}

/** Một "nhiệm vụ sinh": ngữ cảnh đưa cho LLM + tập chunk vàng cho câu sắp tạo. */
interface GenTask {
  type: QuestionType;
  goldChunkIds: string[];
  context: string;
  label?: string;
  scope?: { sectionId?: string; lessonId?: string };
}

const DEFAULT_COUNTS: Record<QuestionType, number> = {
  single: 18,
  'multi-concrete': 18,
  'multi-abstract': 18,
  'lesson-summary': 5,
  'section-summary': 5,
  'course-summary': 1,
  'topic-single': 5,
  'topic-multi': 5,
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'đơn bước',
  'multi-concrete': 'đa bước cụ thể',
  'multi-abstract': 'đa bước trừu tượng',
  'lesson-summary': 'tóm tắt bài',
  'section-summary': 'tóm tắt phần',
  'course-summary': 'tóm tắt khóa',
  'topic-single': 'chủ đề 1 bài',
  'topic-multi': 'chủ đề nhiều bài',
};

const TYPE_ORDER = Object.keys(DEFAULT_COUNTS) as QuestionType[];

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

/** Phân tích `--counts single=10,topic-multi=8` → ghi đè lên DEFAULT_COUNTS. */
function parseCounts(): Record<QuestionType, number> {
  const counts = { ...DEFAULT_COUNTS };
  const raw = arg('counts');
  if (!raw) return counts;
  for (const part of raw.split(',')) {
    const [k, v] = part.split('=');
    const key = k.trim() as QuestionType;
    if (key in counts && Number.isFinite(+v)) counts[key] = parseInt(v, 10);
    else console.warn(`  ⚠ bỏ qua --counts không hợp lệ: "${part}"`);
  }
  return counts;
}

/**
 * Phát hiện ký tự ngoài tiếng Việt/Anh (CJK, kana, hangul, Cyrillic, Ả Rập, Thái,
 * Hebrew, Hy Lạp). Gemini đôi khi tự trả lời bằng tiếng Trung → loại bỏ & sinh lại
 * để golden-set chỉ còn tiếng Việt hoặc tiếng Anh.
 */
const FOREIGN_RANGES: [number, number][] = [
  [0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xf900, 0xfaff], [0xac00, 0xd7af], [0x0400, 0x04ff], [0x0600, 0x06ff],
  [0x0e00, 0x0e7f], [0x0590, 0x05ff], [0x0370, 0x03ff],
];
function hasForeignScript(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (FOREIGN_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return true;
  }
  return false;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Nối nội dung các đoạn, cắt theo từng đoạn và theo tổng độ dài. */
function capJoin(chunks: ChunkRow[], perChunk: number, maxTotal: number): string {
  let total = 0;
  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const piece = chunks[i].content.slice(0, perChunk);
    if (total + piece.length > maxTotal) break;
    total += piece.length;
    parts.push(`--- Đoạn ${i + 1} ---\n${piece}`);
  }
  return parts.join('\n\n');
}

function joinChunks(chunks: ChunkRow[]): string {
  return chunks
    .map((c, i) => `--- Đoạn ${i + 1} ---\n${c.content.slice(0, 1200)}`)
    .join('\n\n');
}

function promptFor(task: GenTask): string {
  const { type, context, label } = task;
  if (type === 'single') {
    return `Dưới đây là một đoạn tài liệu khóa học:
"""
${context}
"""

Đóng vai học viên, tạo MỘT câu hỏi ĐƠN BƯỚC mà đoạn trên trả lời trực tiếp, kèm câu
trả lời ngắn gọn dựa hoàn toàn vào đoạn đó. Câu hỏi tự nhiên, cụ thể, hiểu được mà
không cần nhìn đoạn (không dùng "đoạn trên", "theo tài liệu").

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  if (type === 'multi-concrete') {
    return `Dưới đây là các đoạn LIỀN NHAU trong cùng một bài học:
${context}

Tạo MỘT câu hỏi ĐA BƯỚC CỤ THỂ mà để trả lời ĐẦY ĐỦ phải KẾT HỢP thông tin từ NHIỀU
đoạn ở trên (không chỉ một đoạn). Câu hỏi rõ ràng, đáp án là dữ kiện cụ thể. Không
dùng "đoạn trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  if (type === 'multi-abstract') {
    return `Dưới đây là các đoạn từ những bài KHÁC NHAU trong cùng một phần học:
${context}

Tạo MỘT câu hỏi ĐA BƯỚC TRỪU TƯỢNG mang tính TỔNG HỢP/SO SÁNH/giải thích mối liên hệ
hoặc nguyên lý chung — đòi hỏi suy luận và liên kết thông tin từ NHIỀU đoạn để trả
lời (không thể trả lời chỉ bằng một đoạn). Không dùng "đoạn trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  if (type === 'lesson-summary') {
    return `Dưới đây là nội dung bài học "${label}":
"""
${context}
"""

Tạo MỘT câu hỏi yêu cầu TÓM TẮT nội dung chính của bài học này, kèm câu trả lời là
bản tóm tắt ngắn gọn (3–5 ý chính) dựa trên nội dung trên. Câu hỏi tự nhiên, nêu rõ
tên hoặc chủ đề của bài, KHÔNG dùng "đoạn trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  if (type === 'section-summary') {
    return `Dưới đây là tóm tắt nội dung các bài trong phần học "${label}":
${context}

Tạo MỘT câu hỏi yêu cầu TÓM TẮT/TỔNG HỢP nội dung của CẢ PHẦN này (bao quát nhiều
bài), kèm câu trả lời tổng hợp các ý chính. Câu hỏi nêu rõ tên/chủ đề của phần,
KHÔNG dùng "đoạn trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  if (type === 'course-summary') {
    return `Dưới đây là tóm tắt khái quát của toàn bộ khóa học${
      label ? ` "${label}"` : ''
    }:
${context}

Tạo MỘT câu hỏi yêu cầu TÓM TẮT KHÁI QUÁT những gì TOÀN KHÓA HỌC bao quát (mục tiêu,
các chủ đề/kỹ năng chính), kèm câu trả lời tóm tắt cấp cao. KHÔNG dùng "đoạn
trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
  }
  // topic-single | topic-multi
  const spread =
    type === 'topic-multi'
      ? 'Chủ đề này XUẤT HIỆN Ở NHIỀU BÀI khác nhau; câu hỏi phải đòi hỏi TỔNG HỢP thông tin về nó trải khắp khóa học.'
      : 'Câu hỏi đòi hỏi tổng hợp những gì khóa học trình bày về chủ đề này.';
  return `Dưới đây là thông tin về một chủ đề trong khóa học:
${context}

Tạo MỘT câu hỏi yêu cầu TÓM TẮT/GIẢI THÍCH những gì khóa học trình bày về chủ đề
"${label}", kèm câu trả lời tổng hợp dựa trên thông tin trên. ${spread} Câu hỏi nêu
rõ tên chủ đề, tự nhiên, KHÔNG dùng "đoạn trên"/"theo tài liệu".

Viết câu hỏi VÀ câu trả lời HOÀN TOÀN bằng tiếng Việt (hoặc tiếng Anh nếu nguồn là
tiếng Anh); TUYỆT ĐỐI KHÔNG dùng tiếng Trung/Nhật/Hàn hay bất kỳ ngôn ngữ nào khác.

Chỉ trả về JSON: {"question": "...", "answer": "..."}`;
}

/** Nhóm chunk liền nhau trong cùng bài (cho multi-concrete). */
function consecutiveGroups(chunks: ChunkRow[], size: number): ChunkRow[][] {
  const byLesson = new Map<string, ChunkRow[]>();
  for (const c of chunks) {
    const k = c.lesson_id ?? 'none';
    (byLesson.get(k) ?? byLesson.set(k, []).get(k)!).push(c);
  }
  const groups: ChunkRow[][] = [];
  for (const arr of byLesson.values()) {
    const sorted = arr.sort((a, b) => a.chunk_index - b.chunk_index);
    for (let i = 0; i + size <= sorted.length; i += size) {
      groups.push(sorted.slice(i, i + size));
    }
  }
  return groups;
}

/**
 * Nhóm chunk từ các bài KHÁC NHAU trong cùng phần (cho multi-abstract). Sinh nhiều
 * tổ hợp ngẫu nhiên `size` bài khác nhau/phần (mỗi bài 1 chunk) để có buffer đủ lớn
 * — câu hỏi đa-bước-trừu-tượng cần lượng ứng viên dư vì LLM thỉnh thoảng trả lỗi.
 */
function crossLessonGroups(
  chunks: ChunkRow[],
  size: number,
  perSectionMax = 12,
): ChunkRow[][] {
  const bySection = new Map<string, Map<string, ChunkRow[]>>();
  for (const c of chunks) {
    const sk = c.section_id ?? 'none';
    const lk = c.lesson_id ?? 'none';
    if (!bySection.has(sk)) bySection.set(sk, new Map());
    const lessons = bySection.get(sk)!;
    (lessons.get(lk) ?? lessons.set(lk, []).get(lk)!).push(c);
  }
  const groups: ChunkRow[][] = [];
  for (const lessons of bySection.values()) {
    const lessonArrs = [...lessons.values()].filter((a) => a.length);
    if (lessonArrs.length < 2) continue;
    const take = Math.min(size, lessonArrs.length);
    const seen = new Set<string>();
    for (let attempt = 0; attempt < perSectionMax * 3 && groups.length >= 0; attempt++) {
      if (seen.size >= perSectionMax) break;
      const pickedLessons = shuffle(lessonArrs).slice(0, take);
      const pick = pickedLessons.map((a) => a[Math.floor(Math.random() * a.length)]);
      const key = pick.map((c) => c.id).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(pick);
    }
  }
  return groups;
}

async function genOne(
  deps: Awaited<ReturnType<typeof bootstrap>>,
  task: GenTask,
  attempts = 4,
): Promise<{ question: string; answer: string } | null> {
  // Thử lại vài lần: Gemini thỉnh thoảng trả JSON hỏng/trống — không nên vì thế mà
  // tiêu phí một nguồn hiếm (vd chỉ có 4 phần cho section-summary).
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await deps.gemini.generate(promptFor(task), {
        temperature: 0.4,
        maxOutputTokens: 768,
      });
      const json = raw.replace(/```(?:json)?|```/g, '').trim();
      const parsed = JSON.parse(json) as { question: string; answer: string };
      if (
        parsed.question &&
        parsed.answer &&
        !hasForeignScript(parsed.question + ' ' + parsed.answer)
      ) {
        return { question: parsed.question.trim(), answer: parsed.answer.trim() };
      }
    } catch {
      /* thử lại */
    }
  }
  return null;
}

async function main() {
  const courseId = arg('course');
  if (!courseId) {
    console.error('Thiếu --course <courseId>');
    process.exit(1);
  }
  const counts = parseCounts();
  const target = TYPE_ORDER.reduce((s, t) => s + counts[t], 0);

  const deps = await bootstrap();
  try {
    // ── Lấy dữ liệu (mọi truy vấn read-only) ────────────────────────────────
    const allChunks = await deps.prisma.$queryRaw<ChunkRow[]>`
      SELECT id, lesson_id, section_id, chunk_index, content
      FROM course_chunks
      WHERE course_id = ${courseId}
        AND NOT EXISTS (
          SELECT 1 FROM lessons ql
          WHERE ql.id = course_chunks.lesson_id AND ql.type::text = 'quiz'
        )
      ORDER BY lesson_id, chunk_index;
    `;
    if (allChunks.length === 0) {
      console.error(`Khóa ${courseId} không có chunk phù hợp.`);
      process.exit(1);
    }
    const lessonRows = await deps.prisma.$queryRaw<LessonRow[]>`
      SELECT l.id, l.title, l.section_id
      FROM lessons l JOIN sections s ON s.id = l.section_id
      WHERE s.course_id = ${courseId} AND l.type::text != 'quiz'
      ORDER BY s.order_index, l.order_index;
    `;
    const sectionRows = await deps.prisma.$queryRaw<SectionRow[]>`
      SELECT id, title FROM sections WHERE course_id = ${courseId} ORDER BY order_index;
    `;
    const raptorRows = await deps.prisma.$queryRaw<RaptorRow[]>`
      SELECT id, level, lesson_id, section_id, title, content
      FROM raptor_nodes WHERE course_id = ${courseId};
    `;
    const entityRows = await deps.prisma.$queryRaw<EntityRow[]>`
      SELECT name, description, lesson_ids, chunk_ids, degree
      FROM graph_entities
      WHERE course_id = ${courseId}
        AND COALESCE(array_length(chunk_ids, 1), 0) >= 2
      ORDER BY degree DESC;
    `;

    // ── Index hóa ──────────────────────────────────────────────────────────
    const chunkById = new Map(allChunks.map((c) => [c.id, c]));
    const validChunkIds = new Set(allChunks.map((c) => c.id));
    const chunksByLesson = new Map<string, ChunkRow[]>();
    const chunksBySection = new Map<string, ChunkRow[]>();
    for (const c of allChunks) {
      if (c.lesson_id) (chunksByLesson.get(c.lesson_id) ?? chunksByLesson.set(c.lesson_id, []).get(c.lesson_id)!).push(c);
      if (c.section_id) (chunksBySection.get(c.section_id) ?? chunksBySection.set(c.section_id, []).get(c.section_id)!).push(c);
    }
    const lessonTitle = new Map(lessonRows.map((l) => [l.id, l.title]));
    const sectionTitle = new Map(sectionRows.map((s) => [s.id, s.title]));
    const lessonsBySection = new Map<string, LessonRow[]>();
    for (const l of lessonRows) {
      (lessonsBySection.get(l.section_id) ?? lessonsBySection.set(l.section_id, []).get(l.section_id)!).push(l);
    }
    const raptorL1ByLesson = new Map<string, string>();
    const raptorL2BySection = new Map<string, string>();
    let raptorRoot: string | null = null;
    for (const r of raptorRows) {
      if (r.level === 1 && r.lesson_id) raptorL1ByLesson.set(r.lesson_id, r.content);
      else if (r.level === 2 && r.section_id) raptorL2BySection.set(r.section_id, r.content);
      else if (r.level === 3) raptorRoot = r.content;
    }
    console.log(
      `Chunk: ${allChunks.length}, bài: ${lessonRows.length}, phần: ${sectionRows.length}, ` +
        `raptor node: ${raptorRows.length}, entity(≥2 chunk): ${entityRows.length}.`,
    );

    // ── Dựng nguồn ứng viên cho từng type ──────────────────────────────────
    const qRows = allChunks.filter((c) => c.content.length > 200);

    const singleTasks: GenTask[] = shuffle(qRows.filter((c) => c.content.length > 300)).map(
      (c) => ({ type: 'single', goldChunkIds: [c.id], context: c.content.slice(0, 2500) }),
    );
    const concreteTasks: GenTask[] = shuffle(consecutiveGroups(qRows, 2)).map((g) => ({
      type: 'multi-concrete',
      goldChunkIds: g.map((c) => c.id),
      context: joinChunks(g),
    }));
    let abstractGroups = shuffle(crossLessonGroups(qRows, 3));
    if (abstractGroups.length < counts['multi-abstract']) {
      abstractGroups = shuffle([...abstractGroups, ...consecutiveGroups(qRows, 3)]);
    }
    const abstractTasks: GenTask[] = abstractGroups.map((g) => ({
      type: 'multi-abstract',
      goldChunkIds: g.map((c) => c.id),
      context: joinChunks(g),
    }));

    // lesson-summary: bài có ≥3 chunk; ngữ cảnh ưu tiên node RAPTOR level-1.
    const lessonSummaryTasks: GenTask[] = shuffle(lessonRows)
      .map((l): GenTask | null => {
        const chunks = chunksByLesson.get(l.id) ?? [];
        if (chunks.length < 3) return null;
        const context = raptorL1ByLesson.get(l.id)?.slice(0, 4000) ?? capJoin(chunks, 1000, 4000);
        return {
          type: 'lesson-summary',
          goldChunkIds: chunks.map((c) => c.id),
          context,
          label: l.title,
          scope: { lessonId: l.id },
        };
      })
      .filter((t): t is GenTask => t !== null);

    // section-summary: phần có ≥2 bài; ngữ cảnh ưu tiên node RAPTOR level-2/1.
    const sectionSummaryTasks: GenTask[] = shuffle(sectionRows)
      .map((s): GenTask | null => {
        const lessons = (lessonsBySection.get(s.id) ?? []).filter(
          (l) => (chunksByLesson.get(l.id) ?? []).length > 0,
        );
        const chunks = chunksBySection.get(s.id) ?? [];
        if (lessons.length < 2 || chunks.length === 0) return null;
        let context = raptorL2BySection.get(s.id)?.slice(0, 4500);
        if (!context) {
          const lvl1 = lessons
            .map((l) => raptorL1ByLesson.get(l.id))
            .filter((x): x is string => !!x);
          context = lvl1.length
            ? lvl1.map((c, i) => `--- Bài ${i + 1} ---\n${c.slice(0, 900)}`).join('\n\n').slice(0, 4500)
            : capJoin(
                lessons.flatMap((l) => (chunksByLesson.get(l.id) ?? []).slice(0, 2)),
                700,
                4500,
              );
        }
        return {
          type: 'section-summary',
          goldChunkIds: chunks.map((c) => c.id),
          context,
          label: s.title,
          scope: { sectionId: s.id },
        };
      })
      .filter((t): t is GenTask => t !== null);

    // course-summary: 1 câu; GT = tập đại diện ≤40 chunk trải đều các phần.
    const COURSE_GT_CAP = 40;
    const courseSummaryTasks: GenTask[] = (() => {
      const sectionChunkLists = [...chunksBySection.values()].map((cs) => shuffle(cs));
      const gold: string[] = [];
      let i = 0;
      while (gold.length < COURSE_GT_CAP && sectionChunkLists.some((l) => l.length > i)) {
        for (const list of sectionChunkLists) {
          if (list[i]) gold.push(list[i].id);
          if (gold.length >= COURSE_GT_CAP) break;
        }
        i++;
      }
      const ctxParts = raptorRoot ? [raptorRoot.slice(0, 2500)] : [];
      for (const s of sectionRows) {
        const c = raptorL2BySection.get(s.id);
        if (c) ctxParts.push(`--- Phần "${s.title}" ---\n${c.slice(0, 700)}`);
      }
      let context = ctxParts.join('\n\n').slice(0, 5000);
      if (!context) context = capJoin(gold.map((id) => chunkById.get(id)!).filter(Boolean), 500, 4500);
      return gold.length ? [{ type: 'course-summary', goldChunkIds: gold, context }] : [];
    })();

    // topic-single / topic-multi: từ GraphEntity, lọc chunk hợp lệ.
    const buildTopicTask = (e: EntityRow, type: QuestionType): GenTask | null => {
      const gold = e.chunk_ids.filter((id) => validChunkIds.has(id));
      if (gold.length < 2) return null;
      const srcChunks = gold.map((id) => chunkById.get(id)!).filter(Boolean);
      const context =
        `Chủ đề: ${e.name}\nMô tả: ${e.description.slice(0, 600)}\n\n` +
        `Các đoạn liên quan:\n${capJoin(srcChunks, 800, 3500)}`;
      const scope = type === 'topic-single' ? { lessonId: e.lesson_ids[0] } : undefined;
      return { type, goldChunkIds: gold, context, label: e.name, scope };
    };
    const topicSingleTasks: GenTask[] = entityRows
      .filter((e) => (e.lesson_ids?.length ?? 0) === 1)
      .map((e) => buildTopicTask(e, 'topic-single'))
      .filter((t): t is GenTask => t !== null);
    const topicMultiTasks: GenTask[] = entityRows
      .filter((e) => (e.lesson_ids?.length ?? 0) >= 2)
      .map((e) => buildTopicTask(e, 'topic-multi'))
      .filter((t): t is GenTask => t !== null);

    const SOURCES: Record<QuestionType, GenTask[]> = {
      single: singleTasks,
      'multi-concrete': concreteTasks,
      'multi-abstract': abstractTasks,
      'lesson-summary': lessonSummaryTasks,
      'section-summary': sectionSummaryTasks,
      'course-summary': courseSummaryTasks,
      'topic-single': topicSingleTasks,
      'topic-multi': topicMultiTasks,
    };

    // ── Sinh ───────────────────────────────────────────────────────────────
    const items: GoldenItem[] = [];
    let n = 0;
    for (const type of TYPE_ORDER) {
      const want = counts[type];
      if (want <= 0) continue;
      const source = SOURCES[type];
      let made = 0;
      for (const task of source) {
        if (made >= want) break;
        const qa = await genOne(deps, task);
        if (!qa) continue;
        n++;
        items.push({
          id: `g${String(n).padStart(3, '0')}`,
          courseId,
          type,
          question: qa.question,
          groundTruthAnswer: qa.answer,
          relevantChunkIds: task.goldChunkIds,
          ...(task.scope ? { scope: task.scope } : {}),
        });
        made++;
        process.stdout.write(`\r  ${TYPE_LABEL[type]}: ${made}/${want}   `);
      }
      console.log(`\r  ${TYPE_LABEL[type]}: ${made}/${want}   `);
      if (made < want) {
        console.warn(
          `  ⚠ ${TYPE_LABEL[type]} chỉ tạo ${made}/${want} (thiếu nguồn — ` +
            `kiểm tra RAPTOR/graph extraction của khóa).`,
        );
      }
    }

    const outDir = join(__dirname, 'data');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'golden-set.draft.json');
    writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
    const byType = items.reduce<Record<string, number>>((m, it) => {
      m[it.type!] = (m[it.type!] ?? 0) + 1;
      return m;
    }, {});
    console.log(`\n✓ Tạo ${items.length}/${target} câu → ${outPath}`);
    console.log(`  Phân bố: ${JSON.stringify(byType)}`);
    console.log('  RÀ SOÁT tay rồi đổi tên thành golden-set.json trước khi chạy run.ts.');
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
