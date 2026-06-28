/**
 * Copy NỘI DUNG khóa học (không copy chunk/graph/raptor) từ DB cũ sang DB mới để
 * sau đó re-index lại trên DB mới. Dùng 2 PrismaClient trỏ 2 datasource khác nhau.
 *
 * KHÔNG copy: course_chunks, graph_*, raptor_* (sẽ được sinh lại bởi reindex.ts).
 * CÓ copy: Category (toàn bộ), instructor (User được Course tham chiếu), Course,
 *          Section, Lesson, VideoAsset, DocumentAsset, QuizLesson/Question/Option.
 *
 * Lesson được set moderationStatus='approved' để pipeline index không chặn/không
 * tốn chi phí kiểm duyệt lại (nội dung đã duyệt ở DB cũ).
 *
 * File đính kèm nằm trên MinIO (ngoài DB, dùng chung) nên chỉ cần copy row asset;
 * indexer tự tải lại theo fileUrl/markdownUrl.
 *
 * Chạy (từ apps/backend):
 *   OLD_DATABASE_URL=postgres://...old  DATABASE_URL=postgres://...new \
 *     npx ts-node benchmark/migrate-content.ts --courses <id1>,<id2>
 */
import { PrismaClient } from '@prisma/client';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

async function main() {
  const oldUrl = process.env.OLD_DATABASE_URL;
  const newUrl = process.env.DATABASE_URL;
  const courseIds = (arg('courses') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!oldUrl || !newUrl) {
    console.error('Cần OLD_DATABASE_URL (nguồn) và DATABASE_URL (đích).');
    process.exit(1);
  }
  if (oldUrl === newUrl) {
    console.error('OLD_DATABASE_URL trùng DATABASE_URL — từ chối để tránh tự ghi đè.');
    process.exit(1);
  }
  if (courseIds.length === 0) {
    console.error('Cần --courses <id1>,<id2>,...');
    process.exit(1);
  }

  const src = new PrismaClient({ datasourceUrl: oldUrl });
  const dst = new PrismaClient({ datasourceUrl: newUrl });

  // createMany với object scalar lấy từ findMany (schema giống hệt). Json/Decimal/
  // BigInt/DateTime đều assignable ở runtime; ép any để tránh ma sát kiểu Json.
  const copy = async (
    label: string,
    model: { createMany: (a: any) => Promise<{ count: number }> },
    rows: unknown[],
  ) => {
    if (rows.length === 0) {
      console.log(`  ${label}: 0`);
      return;
    }
    const { count } = await model.createMany({
      data: rows as any,
      skipDuplicates: true,
    });
    console.log(`  ${label}: ${count}/${rows.length}`);
  };

  try {
    console.log(`Copy ${courseIds.length} khóa: ${courseIds.join(', ')}`);

    // ── 0. Category: copy TOÀN BỘ (bảng nhỏ, có self-FK parent). Hai pass để né
    //    vi phạm FK parent: chèn parentId=null trước, cập nhật parent sau.
    const categories = await src.category.findMany();
    await copy(
      'categories',
      dst.category,
      categories.map((c) => ({ ...c, parentId: null })),
    );
    for (const c of categories) {
      if (c.parentId) {
        await dst.category
          .update({ where: { id: c.id }, data: { parentId: c.parentId } })
          .catch(() => undefined);
      }
    }

    // ── 1. Course + instructor (FK bắt buộc instructorId).
    const courses = await src.course.findMany({
      where: { id: { in: courseIds } },
    });
    if (courses.length === 0) {
      console.error('Không tìm thấy khóa nào trong DB nguồn.');
      process.exit(1);
    }
    const instructors = await src.user.findMany({
      where: { id: { in: uniq(courses.map((c) => c.instructorId)) } },
    });
    await copy('instructors (users)', dst.user, instructors);
    await copy('courses', dst.course, courses);

    // ── 2. Section → Lesson (đặt moderationStatus='approved').
    const sections = await src.section.findMany({
      where: { courseId: { in: courseIds } },
    });
    await copy('sections', dst.section, sections);

    const lessons = await src.lesson.findMany({
      where: { sectionId: { in: sections.map((s) => s.id) } },
    });
    await copy(
      'lessons',
      dst.lesson,
      lessons.map((l) => ({ ...l, moderationStatus: 'approved' as const })),
    );
    const lessonIds = lessons.map((l) => l.id);

    // ── 3. Asset bài học (file/video) — nguồn để index.
    const videoAssets = await src.videoAsset.findMany({
      where: { lessonId: { in: lessonIds } },
    });
    await copy('video_assets', dst.videoAsset, videoAssets);

    const documentAssets = await src.documentAsset.findMany({
      where: { lessonId: { in: lessonIds } },
    });
    await copy('document_assets', dst.documentAsset, documentAssets);

    // ── 4. Quiz (RAG loại trừ quiz, nhưng copy để toàn vẹn nội dung khóa).
    const quizLessons = await src.quizLesson.findMany({
      where: { lessonId: { in: lessonIds } },
    });
    await copy('quiz_lessons', dst.quizLesson, quizLessons);

    const quizQuestions = await src.quizQuestion.findMany({
      where: { quizLessonId: { in: quizLessons.map((q) => q.id) } },
    });
    await copy('quiz_questions', dst.quizQuestion, quizQuestions);

    const quizOptions = await src.quizOption.findMany({
      where: { questionId: { in: quizQuestions.map((q) => q.id) } },
    });
    await copy('quiz_options', dst.quizOption, quizOptions);

    console.log(
      '\n✓ Copy nội dung xong. Tiếp theo chạy reindex để sinh chunk/graph/raptor:',
    );
    console.log(
      `  npx ts-node benchmark/reindex.ts --courses ${courseIds.join(',')}`,
    );
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
