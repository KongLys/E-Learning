import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import {
  QuizGenerationService,
  GeneratedQuestion,
} from '../ai/quiz/quiz-generation.service';
import { CourseContentService } from '../ai/quiz/course-content.service';
import { FINAL_QUIZ_QUEUE, GenerateFinalQuizJob } from './final-quiz.queue';

const FINAL_QUIZ_SECTION_TITLE = 'Kiểm tra cuối khóa';
const FINAL_QUIZ_LESSON_TITLE = 'Bài kiểm tra cuối khóa';
const TARGET_QUESTIONS = 30;
const MIN_SOURCE_CHARS = 200;

interface FinalQuizSlot {
  lessonId: string;
  quizLessonId: string;
}

/**
 * Bài kiểm tra cuối khóa: 1 Lesson (isFinalQuiz) + QuizLesson dùng chung hạ tầng
 * quiz chấm điểm. Nếu giảng viên không tự soạn, AI sinh ~30 câu bao quát toàn bộ
 * khóa (phân bổ theo từng chương). Tự sinh khi khóa được duyệt xuất bản.
 */
@Injectable()
export class FinalQuizService {
  private readonly logger = new Logger(FinalQuizService.name);

  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private quizGen: QuizGenerationService,
    private courseContent: CourseContentService,
    @InjectQueue(FINAL_QUIZ_QUEUE)
    private queue: Queue<GenerateFinalQuizJob>,
  ) {}

  // ─── Slot cố định ─────────────────────────────────────────────────────────────

  /**
   * Đảm bảo tồn tại slot quiz cuối khóa (section + lesson + quizLesson) khi khóa
   * bật finalQuizEnabled. Idempotent. Trả về null nếu tính năng đang tắt.
   */
  async ensureFinalQuiz(courseId: string): Promise<FinalQuizSlot | null> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, finalQuizEnabled: true },
    });
    if (!course || !course.finalQuizEnabled) return null;

    const existing = await this.prisma.lesson.findFirst({
      where: { isFinalQuiz: true, section: { courseId } },
      include: { quizLesson: { select: { id: true } } },
    });
    if (existing) {
      if (existing.quizLesson) {
        return { lessonId: existing.id, quizLessonId: existing.quizLesson.id };
      }
      const quizLesson = await this.prisma.quizLesson.create({
        data: { lessonId: existing.id, passingScore: 70 },
      });
      return { lessonId: existing.id, quizLessonId: quizLesson.id };
    }

    const maxSection = await this.prisma.section.aggregate({
      where: { courseId },
      _max: { orderIndex: true },
    });
    const section = await this.prisma.section.create({
      data: {
        courseId,
        title: FINAL_QUIZ_SECTION_TITLE,
        orderIndex: (maxSection._max.orderIndex ?? -1) + 1,
      },
    });
    const lesson = await this.prisma.lesson.create({
      data: {
        sectionId: section.id,
        title: FINAL_QUIZ_LESSON_TITLE,
        type: 'quiz',
        orderIndex: 0,
        isFinalQuiz: true,
        // Không có nội dung cần kiểm duyệt → approved để không chặn gửi duyệt.
        moderationStatus: 'approved',
        quizLesson: { create: { passingScore: 70 } },
      },
      include: { quizLesson: { select: { id: true } } },
    });
    this.logger.log(`Đã tạo slot quiz cuối khóa cho khóa ${courseId}`);
    return { lessonId: lesson.id, quizLessonId: lesson.quizLesson!.id };
  }

  // ─── Bật / tắt ────────────────────────────────────────────────────────────────

  /** Giảng viên bật/tắt bài kiểm tra cuối khóa; đồng bộ lại tiến độ các học viên. */
  async setEnabled(
    courseId: string,
    enabled: boolean,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (userRole !== 'admin' && course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.course.update({
      where: { id: courseId },
      data: { finalQuizEnabled: enabled },
    });

    if (enabled) {
      await this.ensureFinalQuiz(courseId);
    }
    await this.recalcEnrollments(courseId);
    return { finalQuizEnabled: enabled };
  }

  /** Tính lại tiến độ mọi enrollment active của khóa (mẫu số 90/10 thay đổi). */
  private async recalcEnrollments(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: { not: 'cancelled' } },
      select: { id: true },
    });
    for (const e of enrollments) {
      await this.progress
        .recalculateProgress(e.id, courseId)
        .catch((err) =>
          this.logger.warn(
            `recalc enrollment ${e.id} lỗi: ${(err as Error).message}`,
          ),
        );
    }
  }

  // ─── Sinh quiz bằng AI ────────────────────────────────────────────────────────

  /** Đưa khóa vào hàng đợi sinh quiz cuối khóa (gọi khi duyệt xuất bản). */
  async enqueueForCourse(courseId: string): Promise<void> {
    const slot = await this.ensureFinalQuiz(courseId);
    if (!slot) {
      this.logger.log(`Khóa ${courseId} tắt quiz cuối khóa — bỏ qua sinh AI`);
      return;
    }
    if (await this.isInstructorAuthored(slot.quizLessonId)) {
      this.logger.log(
        `Khóa ${courseId} đã có quiz cuối khóa do giảng viên soạn — không sinh AI`,
      );
      return;
    }
    await this.prisma.quizLesson.update({
      where: { id: slot.quizLessonId },
      data: { generationStatus: 'pending', errorMsg: null },
    });
    await this.queue.add(
      'generate',
      { courseId },
      { removeOnComplete: true, removeOnFail: 50 },
    );
  }

  /** Sinh (hoặc sinh lại) quiz cuối khóa — chạy trong processor nền. */
  async generateForCourse(courseId: string): Promise<void> {
    const slot = await this.ensureFinalQuiz(courseId);
    if (!slot) return;
    if (await this.isInstructorAuthored(slot.quizLessonId)) return;

    const quizLesson = await this.prisma.quizLesson.findUnique({
      where: { id: slot.quizLessonId },
      include: { _count: { select: { questions: true } } },
    });
    if (!quizLesson) return;

    // Bỏ qua nếu nội dung không đổi & đã sinh xong.
    const hash = await this.computeSourceHash(courseId);
    if (
      quizLesson.generationStatus === 'ready' &&
      quizLesson.sourceHash === hash &&
      quizLesson._count.questions > 0
    ) {
      this.logger.log(`Khóa ${courseId}: nội dung không đổi — giữ quiz cũ`);
      return;
    }

    await this.prisma.quizLesson.update({
      where: { id: slot.quizLessonId },
      data: { generationStatus: 'generating', errorMsg: null },
    });

    try {
      const questions = await this.buildQuestions(courseId);
      if (questions.length === 0) {
        throw new Error('AI không tạo được câu hỏi cho quiz cuối khóa');
      }
      await this.prisma.$transaction(
        async (tx) => {
          await tx.quizQuestion.deleteMany({
            where: { quizLessonId: slot.quizLessonId },
          });
          for (let qi = 0; qi < questions.length; qi++) {
            const q = questions[qi];
            await tx.quizQuestion.create({
              data: {
                quizLessonId: slot.quizLessonId,
                content: q.content,
                questionType: 'single',
                orderIndex: qi,
                points: 1,
                explanation: q.explanation ?? null,
                options: {
                  create: q.options.map((o, oi) => ({
                    content: o.content,
                    isCorrect: o.isCorrect,
                    orderIndex: oi,
                  })),
                },
              },
            });
          }
          await tx.quizLesson.update({
            where: { id: slot.quizLessonId },
            data: {
              aiGenerated: true,
              generationStatus: 'ready',
              sourceHash: hash,
              errorMsg: null,
            },
          });
        },
        // Sinh nhiều câu hỏi tuần tự (kèm options) trên DB Supabase từ xa có thể
        // vượt mức timeout mặc định 5s của Prisma → nâng giới hạn cho transaction.
        { timeout: 30_000, maxWait: 10_000 },
      );
      this.logger.log(
        `Đã sinh quiz cuối khóa cho ${courseId}: ${questions.length} câu`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Sinh quiz cuối khóa ${courseId} lỗi: ${msg}`);
      await this.prisma.quizLesson
        .update({
          where: { id: slot.quizLessonId },
          data: { generationStatus: 'failed', errorMsg: msg.slice(0, 500) },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** True nếu quiz cuối khóa do giảng viên tự soạn (không được phép ghi đè). */
  private async isInstructorAuthored(quizLessonId: string): Promise<boolean> {
    const quizLesson = await this.prisma.quizLesson.findUnique({
      where: { id: quizLessonId },
      include: { _count: { select: { questions: true } } },
    });
    if (!quizLesson) return false;
    return quizLesson.aiGenerated === false && quizLesson._count.questions > 0;
  }

  /**
   * Sinh câu hỏi phân bổ theo TỪNG CHƯƠNG (section) để đảm bảo mọi chương đều có
   * câu hỏi và mỗi câu bám đúng nội dung chương. Gom round-robin để cân bằng khi
   * tổng > mục tiêu.
   */
  private async buildQuestions(courseId: string): Promise<GeneratedQuestion[]> {
    // Các chương nội dung (loại trừ chương "Kiểm tra cuối khóa").
    const sections = await this.prisma.section.findMany({
      where: { courseId, lessons: { some: { isFinalQuiz: false } } },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, title: true },
    });
    if (sections.length === 0) return [];

    const perSection = Math.max(1, Math.ceil(TARGET_QUESTIONS / sections.length));
    const bySection: GeneratedQuestion[][] = [];
    for (const s of sections) {
      try {
        const source = await this.courseContent.collect(
          courseId,
          `Tổng hợp kiến thức trọng tâm của phần: ${s.title}`,
          { sectionId: s.id },
        );
        if (source.text.length < MIN_SOURCE_CHARS) continue;
        const qs = await this.quizGen.generate(source.text, { count: perSection });
        if (qs.length > 0) bySection.push(qs);
      } catch (err) {
        this.logger.warn(
          `Sinh câu hỏi cho chương "${s.title}" lỗi: ${(err as Error).message}`,
        );
      }
    }

    // Round-robin để mọi chương được đại diện đều, cắt ở mục tiêu ~30 câu.
    const result: GeneratedQuestion[] = [];
    let idx = 0;
    while (result.length < TARGET_QUESTIONS && bySection.some((a) => a.length)) {
      const arr = bySection[idx % bySection.length];
      const q = arr.shift();
      if (q) result.push(q);
      idx++;
    }
    return result;
  }

  /** Hash nội dung chương (chunk) để phát hiện thay đổi → sinh lại khi cần. */
  private async computeSourceHash(courseId: string): Promise<string> {
    const chunks = await this.prisma.courseChunk.findMany({
      where: { courseId },
      orderBy: [{ lessonId: 'asc' }, { chunkIndex: 'asc' }],
      select: { content: true },
    });
    const h = createHash('sha1');
    for (const c of chunks) h.update(c.content ?? '');
    return h.digest('hex');
  }
}
