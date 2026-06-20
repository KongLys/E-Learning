import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import { VectorStoreService, ChunkScope } from './vector/vector-store.service';
import { QuizGenerationService } from './quiz-generation.service';
import { RaptorService } from './raptor/raptor.service';
import { SubmitReviewAttemptDto } from '../review-quiz/dto/submit-review-attempt.dto';

const MIN_QUESTIONS = 10;
const MAX_QUESTIONS = 30;
const RETRIEVE_K = 40;
const MAX_SOURCE_CHARS = 14000;
const MIN_SOURCE_CHARS = 200;

/** Giới hạn ký tự dành cho phần tóm tắt RAPTOR (nội dung cốt lõi). */
const RAPTOR_SUMMARY_CHARS = 5000;
/** Khoảng cách poll (ms) khi chờ RAPTOR build hoàn thành. */
const RAPTOR_POLL_INTERVAL_MS = 3_000;
/** Tổng thời gian tối đa chờ RAPTOR build (ms). */
const RAPTOR_MAX_WAIT_MS = 120_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CreatedQuizInfo {
  id: string;
  title: string;
  questionCount: number;
}

/**
 * Quiz cá nhân (per-user) tạo qua chat AI từ nội dung khoá học. Lưu chung bảng
 * review_quizzes (lessonId = null, userId/courseId/title set) để phân biệt với
 * quiz ôn tập theo bài (dùng chung). Chấm điểm stateless, không đụng tiến độ.
 */
@Injectable()
export class ChatQuizService {
  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    private vector: VectorStoreService,
    private quizGen: QuizGenerationService,
    private raptor: RaptorService,
  ) {}

  /** Sinh quiz cá nhân từ yêu cầu trong chat; trả thông tin tóm tắt. */
  async generateFromChat(
    courseId: string,
    userId: string,
    query: string,
    scope?: ChunkScope,
    requestedCount?: number,
  ): Promise<CreatedQuizInfo> {
    const source = await this.collectCourseContent(courseId, query, scope);
    if (source.length < MIN_SOURCE_CHARS) {
      throw new UnprocessableEntityException(
        'Khoá học chưa có đủ nội dung để tạo quiz',
      );
    }
    const count = Math.min(
      MAX_QUESTIONS,
      Math.max(MIN_QUESTIONS, requestedCount ?? MIN_QUESTIONS),
    );
    const questions = await this.quizGen.generate(source, { count });

    const title = this.buildTitle(query);
    const quiz = await this.prisma.reviewQuiz.create({
      data: {
        lessonId: null,
        userId,
        courseId,
        title,
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

    return { id: quiz.id, title, questionCount: questions.length };
  }

  /** Danh sách quiz qua chat của user trong khoá (mới nhất trước). */
  async listMine(courseId: string, userId: string) {
    const quizzes = await this.prisma.reviewQuiz.findMany({
      where: { courseId, userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    });
    return quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      createdAt: q.createdAt,
      questionCount: q._count.questions,
    }));
  }

  /** 1 quiz kèm câu hỏi/đáp án — ẩn isCorrect; chỉ chủ sở hữu xem được. */
  async getMine(quizId: string, userId: string) {
    const quiz = await this.loadOwned(quizId, userId, true);
    return {
      ...quiz,
      questions: quiz.questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, isCorrect: false })),
      })),
    };
  }

  /** Chấm điểm stateless — không lưu lịch sử, không đụng tiến độ. */
  async submit(quizId: string, userId: string, dto: SubmitReviewAttemptDto) {
    const quiz = await this.loadOwned(quizId, userId, false);

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

  /** Chỉ nạp quiz qua chat (userId set) thuộc về user; loại quiz dùng chung. */
  private async loadOwned(quizId: string, userId: string, ordered: boolean) {
    const quiz = await this.prisma.reviewQuiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: ordered ? { orderIndex: 'asc' } : undefined,
          include: {
            options: ordered ? { orderBy: { orderIndex: 'asc' } } : true,
          },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.userId !== userId) throw new ForbiddenException('Access denied');
    return quiz;
  }

  /**
   * Gom nội dung hai tầng:
   *   Tầng 1 — RAPTOR summary nodes (nội dung cốt lõi / mục tiêu học tập).
   *   Tầng 2 — hybrid search trên raw chunks (chi tiết cụ thể để ra câu hỏi).
   * RAPTOR phải sẵn sàng trước khi tiến hành; nếu chưa có sẽ trigger build và chờ.
   */
  private async collectCourseContent(
    courseId: string,
    query: string,
    scope?: ChunkScope,
  ): Promise<string> {
    // 1. Đảm bảo RAPTOR sẵn sàng (trigger + poll nếu chưa build).
    await this.ensureRaptorReady(courseId);

    // 2. Lấy RAPTOR summaries → phần "nội dung cốt lõi".
    const { label, nodes } = await this.raptor.getScopeNodes(courseId, scope);
    let summarySection = '';
    if (nodes.length > 0) {
      const summaryText = nodes
        .map((n) => (n.title ? `${n.title}\n${n.content}` : n.content))
        .join('\n\n')
        .trim()
        .slice(0, RAPTOR_SUMMARY_CHARS);
      summarySection = `=== NỘI DUNG CỐT LÕI (${label}) ===\n${summaryText}`;
    }

    // 3. Hybrid search trên chunk gốc → phần "nội dung chi tiết".
    let chunks: { content: string }[] = [];
    try {
      const embedding = await this.gemini.embedQuery(query);
      chunks = await this.vector.hybridSearch(
        courseId,
        embedding,
        query,
        RETRIEVE_K,
        scope,
      );
    } catch {
      chunks = [];
    }
    if (chunks.length === 0) {
      chunks = await this.prisma.courseChunk.findMany({
        where: {
          courseId,
          ...(scope?.lessonId ? { lessonId: scope.lessonId } : {}),
          ...(scope?.sectionId ? { sectionId: scope.sectionId } : {}),
        },
        orderBy: { chunkIndex: 'asc' },
        take: RETRIEVE_K,
        select: { content: true },
      });
    }

    // Phân bổ ký tự còn lại cho phần chi tiết sau khi đã có summary.
    const chunkLimit = summarySection
      ? Math.max(2000, MAX_SOURCE_CHARS - summarySection.length - 50)
      : MAX_SOURCE_CHARS;

    const seen = new Set<string>();
    const parts: string[] = [];
    let total = 0;
    for (const c of chunks) {
      const t = (c.content ?? '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
      total += t.length;
      if (total >= chunkLimit) break;
    }
    const chunkSection = parts.join('\n\n');

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
        'Khoá học chưa có đủ nội dung để tạo quiz',
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

  private buildTitle(query: string): string {
    const q = query.trim().replace(/\s+/g, ' ');
    return q.length > 60 ? `${q.slice(0, 60)}…` : q || 'Quiz ôn tập';
  }
}
