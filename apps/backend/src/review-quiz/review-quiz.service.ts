import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { SubmitReviewAttemptDto } from './dto/submit-review-attempt.dto';

const QUESTION_COUNT = 5;
const MIN_SOURCE_CHARS = 200;
const MAX_SOURCE_CHARS = 12000;

interface GeneratedQuestion {
  content: string;
  options: { content: string; isCorrect: boolean }[];
  explanation?: string;
}

@Injectable()
export class ReviewQuizService {
  private readonly logger = new Logger(ReviewQuizService.name);
  private readonly provider: 'gemini' | 'ollama';
  private readonly model: string | undefined;

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    config: ConfigService,
  ) {
    // Mặc định Ollama (local, không tốn quota), độc lập với CHAT_PROVIDER của RAG.
    this.provider =
      config.get<string>('REVIEW_QUIZ_PROVIDER', 'ollama') === 'gemini'
        ? 'gemini'
        : 'ollama';
    this.model = config.get<string>('REVIEW_QUIZ_MODEL', '') || undefined;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

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
    const source = await this.collectLessonContent(lessonId, lesson);
    if (source.length < MIN_SOURCE_CHARS) {
      throw new UnprocessableEntityException(
        'Bài học chưa có đủ nội dung để tạo quiz ôn tập',
      );
    }

    const questions = await this.generateQuestions(lesson.title, source);

    // Thay thế bộ câu hỏi cũ (nếu có) — dùng chung mỗi bài học.
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewQuiz.deleteMany({ where: { lessonId } });
      await tx.reviewQuiz.create({
        data: {
          lessonId,
          model: this.model ?? this.provider,
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

  /** Gom nội dung nguồn để sinh câu hỏi: chunk đã index > transcript/tài liệu thô. */
  private async collectLessonContent(
    lessonId: string,
    lesson: {
      title: string;
      description: string | null;
      videoAsset: { transcript: string | null } | null;
      documentAsset: { contentHtml: string | null } | null;
    },
  ): Promise<string> {
    const parts: string[] = [];
    if (lesson.title) parts.push(lesson.title);
    if (lesson.description) parts.push(lesson.description);

    // Nguồn tốt nhất: các chunk đã parse/index sẵn cho RAG.
    const chunks = await this.prisma.courseChunk.findMany({
      where: { lessonId },
      orderBy: { chunkIndex: 'asc' },
      select: { content: true },
    });
    for (const c of chunks) parts.push(c.content);

    // Bổ sung transcript video / nội dung tài liệu thô (phòng khi chưa có chunk).
    if (lesson.videoAsset?.transcript) parts.push(lesson.videoAsset.transcript);
    if (lesson.documentAsset?.contentHtml) {
      parts.push(this.stripHtml(lesson.documentAsset.contentHtml));
    }

    return parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async generateQuestions(
    lessonTitle: string,
    source: string,
  ): Promise<GeneratedQuestion[]> {
    const systemInstruction =
      'Bạn là trợ giảng tạo câu hỏi trắc nghiệm ôn tập bằng tiếng Việt. ' +
      'Chỉ dựa vào nội dung bài học được cung cấp. ' +
      'Luôn trả về JSON hợp lệ đúng định dạng yêu cầu, không kèm bất kỳ chữ nào ngoài JSON.';

    const prompt = `Dựa vào nội dung bài học dưới đây, hãy tạo ${QUESTION_COUNT} câu hỏi trắc nghiệm ôn tập (mỗi câu có đúng 1 đáp án đúng và 4 lựa chọn).

Trả về DUY NHẤT một mảng JSON, mỗi phần tử có dạng:
{
  "content": "nội dung câu hỏi",
  "options": [
    { "content": "lựa chọn A", "isCorrect": true },
    { "content": "lựa chọn B", "isCorrect": false },
    { "content": "lựa chọn C", "isCorrect": false },
    { "content": "lựa chọn D", "isCorrect": false }
  ],
  "explanation": "giải thích ngắn gọn vì sao đáp án đúng"
}

Quy tắc: mỗi câu đúng 4 lựa chọn và đúng 1 lựa chọn isCorrect=true; câu hỏi không trùng nhau; chỉ hỏi nội dung có trong bài.

Tiêu đề bài học: ${lessonTitle}

Nội dung bài học:
"""
${source}
"""`;

    let raw: string;
    try {
      raw = await this.gemini.generate(prompt, {
        provider: this.provider,
        model: this.model,
        temperature: 0.4,
        maxOutputTokens: 2048,
        systemInstruction,
      });
    } catch (err) {
      this.logger.error(
        `Review quiz generation failed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Không tạo được quiz ôn tập, vui lòng thử lại',
      );
    }

    const questions = this.parseQuestions(raw);
    if (questions.length === 0) {
      this.logger.warn(
        `Review quiz: could not parse any valid question from model output`,
      );
      throw new ServiceUnavailableException(
        'Không tạo được quiz ôn tập, vui lòng thử lại',
      );
    }
    return questions;
  }

  /** Bóc JSON từ output model (bỏ rào ```json, chữ thừa) và validate từng câu. */
  private parseQuestions(raw: string): GeneratedQuestion[] {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) text = text.slice(start, end + 1);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const valid: GeneratedQuestion[] = [];
    for (const item of parsed) {
      const q = item as Partial<GeneratedQuestion>;
      if (!q || typeof q.content !== 'string' || !Array.isArray(q.options)) {
        continue;
      }
      const options = q.options
        .filter(
          (o): o is { content: string; isCorrect: boolean } =>
            !!o && typeof o.content === 'string',
        )
        .map((o) => ({ content: o.content, isCorrect: o.isCorrect === true }));
      const correctCount = options.filter((o) => o.isCorrect).length;
      // Chỉ nhận câu 1-đáp-án hợp lệ (>=2 lựa chọn, đúng 1 đáp án đúng).
      if (options.length < 2 || correctCount !== 1) continue;
      valid.push({
        content: q.content,
        options,
        explanation:
          typeof q.explanation === 'string' ? q.explanation : undefined,
      });
    }
    return valid;
  }
}
