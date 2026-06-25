import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkScope } from '../vector/vector-store.service';
import { QuizGenerationService } from './quiz-generation.service';
import { CourseContentService } from './course-content.service';
import { SubmitReviewAttemptDto } from '../../review-quiz/dto/submit-review-attempt.dto';

const MIN_QUESTIONS = 10;
const MAX_QUESTIONS = 30;
const MIN_SOURCE_CHARS = 200;

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
    private quizGen: QuizGenerationService,
    private courseContent: CourseContentService,
  ) {}

  /** Sinh quiz cá nhân từ yêu cầu trong chat; trả thông tin tóm tắt. */
  async generateFromChat(
    courseId: string,
    userId: string,
    query: string,
    scope?: ChunkScope,
    requestedCount?: number,
  ): Promise<CreatedQuizInfo> {
    const source = await this.courseContent.collect(courseId, query, scope);
    if (source.text.length < MIN_SOURCE_CHARS) {
      throw new UnprocessableEntityException(
        'Khoá học chưa có đủ nội dung để tạo quiz',
      );
    }
    const count = Math.min(
      MAX_QUESTIONS,
      Math.max(MIN_QUESTIONS, requestedCount ?? MIN_QUESTIONS),
    );
    const questions = await this.quizGen.generate(source.text, { count });

    const title = this.buildTitle(query);
    const quiz = await this.prisma.reviewQuiz.create({
      data: {
        lessonId: null,
        userId,
        courseId,
        title,
        model: this.quizGen.usedModel,
        sourceChunkIds: source.chunkIds,
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

  private buildTitle(query: string): string {
    const q = query.trim().replace(/\s+/g, ' ');
    return q.length > 60 ? `${q.slice(0, 60)}…` : q || 'Quiz ôn tập';
  }
}
