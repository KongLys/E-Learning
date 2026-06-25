import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuizGenerationService } from '../ai/quiz/quiz-generation.service';
import { RaptorService } from '../ai/raptor/raptor.service';
import { SubmitReviewAttemptDto } from './dto/submit-review-attempt.dto';

const QUESTION_COUNT = 5;
const MIN_SOURCE_CHARS = 200;
const MAX_SOURCE_CHARS = 12000;

/** Giới hạn ký tự dành cho phần tóm tắt RAPTOR (nội dung cốt lõi bài học). */
const RAPTOR_SUMMARY_CHARS = 3000;
const RAPTOR_POLL_INTERVAL_MS = 3_000;
const RAPTOR_MAX_WAIT_MS = 120_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ReviewQuizService {
  constructor(
    private prisma: PrismaService,
    private quizGen: QuizGenerationService,
    private raptor: RaptorService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Danh sách quiz ôn tập (theo bài học) đã tạo trong khoá — mới nhất trước.
   * Quiz ôn tập dùng chung mỗi bài, không gắn user nên trả về theo khoá.
   */
  async listByCourse(courseId: string, userId: string, userRole: string) {
    await this.assertCourseAccess(courseId, userId, userRole);
    const quizzes = await this.prisma.reviewQuiz.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        lessonId: true,
        createdAt: true,
        updatedAt: true,
        lesson: { select: { title: true } },
        _count: { select: { questions: true } },
      },
    });
    return quizzes.map((q) => ({
      lessonId: q.lessonId!,
      lessonTitle: q.lesson?.title ?? '',
      questionCount: q._count.questions,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));
  }

  /** Lấy quiz ôn tập của bài học (đã ẩn đáp án đúng), hoặc null nếu chưa tạo. */
  async getReviewQuiz(lessonId: string, userId: string, userRole: string) {
    await this.assertLessonAccess(lessonId, userId, userRole);
    const quiz = await this.prisma.reviewQuiz.findUnique({
      where: { lessonId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { options: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!quiz) return null;
    return {
      ...quiz,
      questions: quiz.questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, isCorrect: false })),
      })),
    };
  }

  /** Sinh (hoặc sinh lại) quiz ôn tập bằng AI từ nội dung bài học. */
  async generate(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.assertLessonAccess(lessonId, userId, userRole);
    const courseId = lesson.section.course.id;
    const source = await this.collectLessonContent(courseId, lessonId, lesson);
    if (source.length < MIN_SOURCE_CHARS) {
      throw new UnprocessableEntityException(
        'Bài học chưa có đủ nội dung để tạo quiz ôn tập',
      );
    }

    const questions = await this.quizGen.generate(source, {
      count: QUESTION_COUNT,
    });

    // Thay thế bộ câu hỏi cũ (nếu có) — dùng chung mỗi bài học.
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewQuiz.deleteMany({ where: { lessonId } });
      await tx.reviewQuiz.create({
        data: {
          lessonId,
          model: this.quizGen.usedModel,
          questions: {
            create: questions.map((q, qi) => ({
              content: q.content,
              orderIndex: qi,
              explanation: q.explanation ?? null,
              options: {
                create: q.options.map((o, oi) => ({
                  content: o.content,
                  isCorrect: o.isCorrect,
                  orderIndex: oi,
                })),
              },
            })),
          },
        },
      });
    });

    return { count: questions.length };
  }

  /** Chấm điểm stateless — KHÔNG lưu lịch sử, KHÔNG ảnh hưởng tiến độ khoá học. */
  async submit(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: SubmitReviewAttemptDto,
  ) {
    await this.assertLessonAccess(lessonId, userId, userRole);
    const quiz = await this.prisma.reviewQuiz.findUnique({
      where: { lessonId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { options: true },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Review quiz not found');

    let correct = 0;
    const results = quiz.questions.map((question) => {
      const correctOptionIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id);
      const answer = dto.answers.find((a) => a.questionId === question.id);
      const yourOptionIds = answer?.optionIds ?? [];
      const isCorrect =
        correctOptionIds.length === yourOptionIds.length &&
        correctOptionIds.every((id) => yourOptionIds.includes(id));
      if (isCorrect) correct += 1;
      return {
        questionId: question.id,
        isCorrect,
        correctOptionIds,
        explanation: question.explanation,
      };
    });

    const total = quiz.questions.length;
    const score = total > 0 ? (correct / total) * 100 : 0;
    return { score, total, correct, results };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Cho phép giảng viên sở hữu / admin HOẶC học viên đang theo học khoá đó. */
  private async assertCourseAccess(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === userId || userRole === 'admin') return;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId, status: 'active' },
    });
    if (!enrollment) {
      throw new ForbiddenException('Not enrolled in this course');
    }
  }

  /** Cho phép giảng viên sở hữu / admin HOẶC học viên đang theo học bài đó. */
  private async assertLessonAccess(
    lessonId: string,
    userId: string,
    userRole: string,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: { include: { course: true } },
        videoAsset: true,
        documentAsset: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type === 'quiz') {
      throw new UnprocessableEntityException(
        'Bài kiểm tra không hỗ trợ quiz ôn tập',
      );
    }

    const course = lesson.section.course;
    const isOwner = course.instructorId === userId || userRole === 'admin';
    if (isOwner) return lesson;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId: course.id, status: 'active' },
    });
    if (!enrollment) {
      throw new ForbiddenException('Not enrolled in this course');
    }
    return lesson;
  }

  /**
   * Gom nội dung hai tầng cho bài học:
   *   Tầng 1 — RAPTOR level-1 node của bài (nội dung cốt lõi / mục tiêu học tập).
   *   Tầng 2 — chunk thô + transcript / tài liệu (chi tiết cụ thể để ra câu hỏi).
   * RAPTOR phải sẵn sàng trước; nếu chưa có sẽ trigger build và chờ.
   */
  private async collectLessonContent(
    courseId: string,
    lessonId: string,
    lesson: {
      title: string;
      description: string | null;
      videoAsset: { transcript: string | null } | null;
      documentAsset: { contentHtml: string | null } | null;
    },
  ): Promise<string> {
    // 1. Đảm bảo RAPTOR sẵn sàng (trigger + poll nếu chưa build).
    await this.ensureRaptorReady(courseId);

    // 2. RAPTOR level-1 node của bài → phần "nội dung cốt lõi".
    const { nodes } = await this.raptor.getScopeNodes(courseId, { lessonId });
    let summarySection = '';
    if (nodes.length > 0) {
      const summaryText = nodes
        .map((n) => (n.title ? `${n.title}\n${n.content}` : n.content))
        .join('\n\n')
        .trim()
        .slice(0, RAPTOR_SUMMARY_CHARS);
      summarySection = `=== NỘI DUNG CỐT LÕI ===\n${summaryText}`;
    }

    // 3. Nội dung chi tiết: chunk đã index > transcript/tài liệu thô.
    const detailParts: string[] = [];
    if (lesson.title) detailParts.push(lesson.title);
    if (lesson.description) detailParts.push(lesson.description);

    const chunks = await this.prisma.courseChunk.findMany({
      where: { lessonId },
      orderBy: { chunkIndex: 'asc' },
      select: { content: true },
    });
    for (const c of chunks) detailParts.push(c.content);

    if (lesson.videoAsset?.transcript) detailParts.push(lesson.videoAsset.transcript);
    if (lesson.documentAsset?.contentHtml) {
      detailParts.push(this.stripHtml(lesson.documentAsset.contentHtml));
    }

    const chunkLimit = summarySection
      ? Math.max(1000, MAX_SOURCE_CHARS - summarySection.length - 50)
      : MAX_SOURCE_CHARS;

    const chunkSection = detailParts
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, chunkLimit);

    if (summarySection && chunkSection) {
      return `${summarySection}\n\n=== NỘI DUNG CHI TIẾT ===\n${chunkSection}`.slice(
        0,
        MAX_SOURCE_CHARS,
      );
    }
    return (summarySection || chunkSection).slice(0, MAX_SOURCE_CHARS);
  }

  /**
   * Trigger build RAPTOR nếu chưa có / cũ, sau đó poll cho đến khi cây sẵn sàng
   * hoặc hết timeout. Ném lỗi phù hợp thay vì fallback về flow cũ.
   */
  private async ensureRaptorReady(courseId: string): Promise<void> {
    const readiness = await this.raptor.ensureReady(courseId);
    if (readiness === 'empty') {
      throw new UnprocessableEntityException(
        'Bài học chưa có đủ nội dung để tạo quiz ôn tập',
      );
    }
    if (readiness === 'ready') return;

    // 'building' → đã enqueue, poll cho đến khi hoàn thành.
    const deadline = Date.now() + RAPTOR_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(RAPTOR_POLL_INTERVAL_MS);
      const tree = await this.prisma.courseRaptorTree.findUnique({
        where: { courseId },
        select: { status: true },
      });
      if (tree?.status === 'ready') return;
      if (tree?.status === 'failed') {
        throw new ServiceUnavailableException(
          'Không thể xây dựng cấu trúc nội dung khoá học, vui lòng thử lại',
        );
      }
    }
    throw new ServiceUnavailableException(
      'Đang xây dựng cấu trúc nội dung khoá học, vui lòng thử lại sau ít phút',
    );
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
