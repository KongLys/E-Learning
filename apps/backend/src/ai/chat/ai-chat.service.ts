import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService, Citation } from '../rag/rag.service';
import { ChunkScope } from '../vector/vector-store.service';
import { ChatQuizService, CreatedQuizInfo } from '../quiz/chat-quiz.service';
import { ChatSummaryService, SummaryLevel } from './chat-summary.service';
import { neutralizeInline, MAX_USER_QUERY_LEN } from '../guard/prompt-safety.util';
import { GuardrailService } from '../guard/guardrail.service';
import { REFUSAL_MESSAGE, scrubOutput } from '../guard/injection-guard.util';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private prisma: PrismaService,
    private rag: RagService,
    private chatQuiz: ChatQuizService,
    private chatSummary: ChatSummaryService,
    private guardrail: GuardrailService,
  ) {}

  async assertAccess(courseId: string, userId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === userId) return;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to use AI chat',
      );
    }
  }

  async createConversation(courseId: string, userId: string, title?: string) {
    await this.assertAccess(courseId, userId);
    return this.prisma.aiConversation.create({
      data: { courseId, userId, title: title ?? null },
    });
  }

  async listConversations(courseId: string, userId: string) {
    await this.assertAccess(courseId, userId);
    return this.prisma.aiConversation.findMany({
      where: { courseId, userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMessages(conversationId: string, userId: string) {
    const conv = await this.loadConversation(conversationId, userId);
    return this.prisma.aiMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async loadConversation(conversationId: string, userId: string) {
    const conv = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.userId !== userId) throw new ForbiddenException('Access denied');
    return conv;
  }

  async ask(
    conversationId: string,
    userId: string,
    query: string,
    scope?: ChunkScope,
  ) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Query is too short');
    }
    if (query.length > MAX_USER_QUERY_LEN) {
      throw new BadRequestException('Query is too long');
    }
    const conv = await this.loadConversation(conversationId, userId);

    // Load history (last 10 messages)
    const history = await this.prisma.aiMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    // Trung hòa nội dung lịch sử (do người dùng nhập / model sinh) trước khi nối
    // vào prompt — tránh prompt injection qua các lượt hội thoại trước.
    const formattedHistory = history
      .reverse()
      .map(
        (m) =>
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${neutralizeInline(m.content, 1000)}`,
      );

    // Save user message
    await this.prisma.aiMessage.create({
      data: { conversationId: conv.id, role: 'user', content: query },
    });

    const persistAssistant =
      (fullText: string, citations?: Citation[]) => async () => {
        await this.prisma.aiMessage.create({
          data: {
            conversationId: conv.id,
            role: 'assistant',
            content: fullText,
            citations: citations
              ? (citations as unknown as Prisma.InputJsonValue)
              : undefined,
          },
        });
        await this.prisma.aiConversation.update({
          where: { id: conv.id },
          data: {
            updatedAt: new Date(),
            // Set title from first question if not yet set
            ...(conv.title ? {} : { title: query.slice(0, 80) }),
          },
        });
      };

    // Guardrail đầu vào: phát hiện ý đồ prompt injection / jailbreak.
    const guard = await this.guardrail.inspectQuery(query);
    if (guard.verdict !== 'clean') {
      this.logger.warn(
        `Guardrail ${guard.verdict} (${guard.category ?? 'unknown'}) on conversation ${conv.id}`,
      );
    }
    if (guard.verdict === 'block') {
      async function* refusalStream(): AsyncGenerator<string> {
        yield REFUSAL_MESSAGE;
      }
      return {
        stream: refusalStream(),
        citations: [] as Citation[],
        conversationId: conv.id,
        persist: (fullText: string) => persistAssistant(fullText)(),
        getQuiz: (): CreatedQuizInfo | null => null,
      };
    }
    // 'strip': bỏ mệnh đề injection, chỉ xử lý phần câu hỏi hợp lệ còn lại.
    const effectiveQuery =
      guard.verdict === 'strip' ? guard.sanitizedQuery : query;

    // Nhánh tạo quiz: nếu người dùng yêu cầu tạo quiz trong chat thì sinh quiz
    // cá nhân thay vì trả lời RAG.
    const intent = detectQuizIntent(effectiveQuery);
    if (intent.isQuiz) {
      const chatQuiz = this.chatQuiz;
      const courseId = conv.courseId;
      let createdQuiz: CreatedQuizInfo | null = null;
      async function* quizStream(): AsyncGenerator<string> {
        yield 'Đang tạo quiz ôn tập từ nội dung khoá học…\n\n';
        const info = await chatQuiz.generateFromChat(
          courseId,
          userId,
          effectiveQuery,
          scope,
          intent.count,
        );
        createdQuiz = info;
        yield `✅ Đã tạo quiz “${info.title}” gồm ${info.questionCount} câu hỏi. Mở ở mục “Quiz của tôi” trong thanh nội dung khoá học để làm bài.`;
      }
      return {
        stream: quizStream(),
        citations: [] as Citation[],
        conversationId: conv.id,
        persist: (fullText: string) => persistAssistant(fullText)(),
        getQuiz: () => createdQuiz,
      };
    }

    // Guardrail đầu ra: gỡ marker nội bộ / đoạn rò rỉ system prompt nếu model echo.
    async function* scrubbedStream(
      src: AsyncIterable<string>,
    ): AsyncGenerator<string> {
      for await (const piece of src) yield scrubOutput(piece);
    }

    // Nhánh tóm tắt theo PHẠM VI (bài/phần/khóa, không nêu chủ đề cụ thể): dùng cây
    // RAPTOR (luồng riêng). Tóm tắt một CHỦ ĐỀ cụ thể thì rơi xuống rag.ask để dùng
    // LightRAG truy vấn có liên kết (gom khái niệm rải rác tốt hơn).
    const summaryIntent = detectSummaryIntent(effectiveQuery);
    if (summaryIntent.isSummary && !summaryIntent.hasTopic) {
      const summary = await this.chatSummary.summarize(
        conv.courseId,
        effectiveQuery,
        scope,
        summaryIntent.level,
      );
      return {
        stream: scrubbedStream(summary.stream),
        citations: summary.citations,
        conversationId: conv.id,
        persist: (fullText: string) =>
          persistAssistant(fullText, summary.citations)(),
        getQuiz: (): CreatedQuizInfo | null => null,
      };
    }

    // Run RAG pipeline (có thể giới hạn phạm vi theo Phần/Bài). Với tóm tắt-chủ-đề
    // cấp khóa, mở rộng phạm vi toàn khóa để LightRAG quét khắp tài liệu.
    const askScope =
      summaryIntent.isSummary && summaryIntent.level === 'course'
        ? undefined
        : scope;
    const result = await this.rag.ask(
      conv.courseId,
      effectiveQuery,
      formattedHistory,
      askScope,
    );

    return {
      stream: scrubbedStream(result.stream),
      citations: result.citations,
      conversationId: conv.id,
      persist: (fullText: string) =>
        persistAssistant(fullText, result.citations)(),
      getQuiz: (): CreatedQuizInfo | null => null,
    };
  }

  /**
   * Giải thích đáp án một câu quiz ôn tập (do AI sinh). Tra câu hỏi authoritative
   * từ DB (đáp án đúng + chunk nguồn đã lưu), uỷ quyền sinh cho `rag.explainQuizAnswer`,
   * rồi lưu cặp hỏi/đáp vào hội thoại để hiện trong panel chat.
   */
  async explainQuizAnswer(
    conversationId: string,
    userId: string,
    body: { questionId: string; pickedOptionIds: string[] },
  ) {
    const conv = await this.loadConversation(conversationId, userId);

    const question = await this.prisma.reviewQuizQuestion.findUnique({
      where: { id: body.questionId },
      include: {
        options: { orderBy: { orderIndex: 'asc' } },
        reviewQuiz: {
          select: {
            userId: true,
            courseId: true,
            lessonId: true,
            sourceChunkIds: true,
            lesson: { select: { section: { select: { courseId: true } } } },
          },
        },
      },
    });
    if (!question) throw new NotFoundException('Quiz question not found');

    const rq = question.reviewQuiz;
    const questionCourseId = rq.lesson?.section?.courseId ?? rq.courseId ?? null;
    if (!questionCourseId || questionCourseId !== conv.courseId) {
      throw new ForbiddenException('Quiz question does not belong to this course');
    }
    if (rq.userId && rq.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Nhãn A/B/C/D theo thứ tự lựa chọn; server là nguồn tin cậy cho đúng/sai.
    const labelFor = (i: number) => String.fromCharCode(65 + i);
    const pickedSet = new Set(body.pickedOptionIds);
    const optionsLabeled = question.options.map((o, i) => ({
      label: labelFor(i),
      content: o.content,
    }));
    const correctLabels: string[] = [];
    const pickedLabels: string[] = [];
    const correctIds: string[] = [];
    question.options.forEach((o, i) => {
      if (o.isCorrect) {
        correctLabels.push(labelFor(i));
        correctIds.push(o.id);
      }
      if (pickedSet.has(o.id)) pickedLabels.push(labelFor(i));
    });
    const isCorrect =
      correctIds.length === body.pickedOptionIds.length &&
      correctIds.every((id) => pickedSet.has(id));
    const verdict =
      body.pickedOptionIds.length === 0
        ? 'không chọn'
        : isCorrect
          ? 'đúng'
          : 'sai';

    const scope = rq.lessonId ? { lessonId: rq.lessonId } : undefined;

    const userMessage = `Giải thích câu hỏi ôn tập: "${question.content}". Đáp án đúng: ${correctLabels.join(', ') || '(không xác định)'}. Lựa chọn của tôi: ${pickedLabels.join(', ') || '(không chọn)'} (${verdict}). Vì sao?`;

    await this.prisma.aiMessage.create({
      data: { conversationId: conv.id, role: 'user', content: userMessage },
    });

    const { stream, citations } = await this.rag.explainQuizAnswer({
      courseId: conv.courseId,
      scope,
      questionText: question.content,
      optionsLabeled,
      correctLabels,
      pickedLabels,
      verdict,
      storedExplanation: question.explanation,
      chunkIds: rq.sourceChunkIds ?? [],
    });

    const persist = async (fullText: string) => {
      await this.prisma.aiMessage.create({
        data: {
          conversationId: conv.id,
          role: 'assistant',
          content: fullText,
          citations: citations as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: {
          updatedAt: new Date(),
          ...(conv.title ? {} : { title: userMessage.slice(0, 80) }),
        },
      });
    };

    async function* scrubbedStream(
      src: AsyncIterable<string>,
    ): AsyncGenerator<string> {
      for await (const piece of src) yield scrubOutput(piece);
    }

    return {
      stream: scrubbedStream(stream),
      citations,
      conversationId: conv.id,
      persist,
      getQuiz: (): CreatedQuizInfo | null => null,
    };
  }

  serializeCitations(citations: Citation[]) {
    return citations.map((c, i) => ({
      index: i + 1,
      chunkId: c.chunkId,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      sectionId: c.sectionId,
      lessonId: c.lessonId,
      excerpt: c.excerpt,
    }));
  }
}

/**
 * Nhận diện ý định "tạo quiz" trong tin nhắn chat (anchor động từ tạo + danh từ
 * quiz để tránh dương tính giả như "quiz là gì"). Trả số câu nếu người dùng nêu.
 */
export function detectQuizIntent(query: string): {
  isQuiz: boolean;
  count?: number;
} {
  const q = query.toLowerCase();
  const isQuiz =
    /(tạo|tao|soạn|soan|sinh|generate|create|make)\b[^]*?(quiz|trắc nghiệm|trac nghiem|câu hỏi|cau hoi|bài kiểm tra|bai kiem tra|đề kiểm tra|de kiem tra|bộ câu hỏi|bo cau hoi)/.test(
      q,
    );
  if (!isQuiz) return { isQuiz: false };
  const m = q.match(/(\d{1,3})\s*(câu|cau|question)/);
  const count = m ? parseInt(m[1], 10) : undefined;
  return { isQuiz: true, count };
}

/**
 * Nhận diện ý định "tóm tắt / tổng quan nội dung" để route sang luồng RAPTOR.
 * Suy thêm phạm vi (khóa/phần/bài) từ từ khóa, ghi đè scope mặc định khi người
 * dùng nói rõ ("toàn khóa" / "bài này"). Tránh dương tính giả cho câu định nghĩa
 * kiểu "tóm tắt là gì".
 */
export function detectSummaryIntent(query: string): {
  isSummary: boolean;
  level?: SummaryLevel;
  hasTopic?: boolean;
} {
  const q = query.toLowerCase();
  const isSummary =
    /(tóm tắt|tóm lược|tóm gọn|sơ lược|khái quát|tổng quan|tổng hợp lại|nội dung chính|ý chính|các ý chính|những ý chính|điểm chính|summary|summarize|summarise|overview|recap)/.test(
      q,
    );
  if (!isSummary) return { isSummary: false };
  // "tóm tắt là gì" / "tổng quan là gì" → câu hỏi định nghĩa, để RAG xử lý.
  if (/(tóm tắt|tổng quan|tổng hợp|khái quát)\s+(là gì|nghĩa là)/.test(q)) {
    return { isSummary: false };
  }
  let level: SummaryLevel | undefined;
  if (/(toàn khóa|cả khóa|toàn bộ khóa|khóa học|cả môn|toàn bộ môn)/.test(q)) {
    level = 'course';
  } else if (/(phần này|chương này|cả phần|toàn bộ phần)/.test(q)) {
    level = 'section';
  } else if (/(bài học này|bài này|bài hiện tại|bài đang học)/.test(q)) {
    level = 'lesson';
  }
  return { isSummary: true, level, hasTopic: summaryHasTopic(q) };
}

/**
 * Suy ra câu tóm tắt có nhắm tới một CHỦ ĐỀ cụ thể hay không (vd "tóm tắt về con
 * trỏ") so với chỉ tóm tắt theo phạm vi (vd "tóm tắt bài này"). Lược bỏ cụm kích
 * hoạt tóm tắt, cụm chỉ phạm vi, và các từ đệm/đánh dấu; còn token nội dung có
 * nghĩa ⇒ có chủ đề. Heuristic — chấp nhận sai số nhỏ.
 */
function summaryHasTopic(q: string): boolean {
  let s = q.toLowerCase();
  // (a) cụm kích hoạt tóm tắt + marker chủ đề chung
  s = s.replace(
    /(tóm tắt|tóm lược|tóm gọn|sơ lược|khái quát|tổng quan|tổng hợp lại|tổng hợp|nội dung chính|các ý chính|những ý chính|nội dung|ý chính|điểm chính|khái niệm|chủ đề|kiến thức|summary|summarize|summarise|overview|recap)/g,
    ' ',
  );
  // (b) cụm chỉ phạm vi (đa từ, bỏ trước token đơn)
  s = s.replace(
    /(toàn bộ khóa học|toàn khóa|cả khóa|toàn bộ khóa|toàn bộ môn|cả môn|khóa học|khoá học|môn học|phần này|chương này|cả phần|toàn bộ phần|bài học này|bài này|bài hiện tại|bài đang học|this lesson|this course|this section|this chapter)/g,
    ' ',
  );
  const tokens = s
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !SUMMARY_FILLER.has(t));
  return tokens.length > 0;
}

/** Từ đệm/đánh dấu/phạm vi đơn lẻ — không tính là "chủ đề". */
const SUMMARY_FILLER = new Set<string>([
  'về', 'của', 'cho', 'mình', 'tôi', 'hãy', 'giúp', 'giùm', 'dùm', 'các',
  'những', 'này', 'đó', 'kia', 'trong', 'một', 'với', 'và', 'là', 'gì', 'nhỉ',
  'nhé', 'ạ', 'vậy', 'khóa', 'khoá', 'môn', 'học', 'phần', 'chương', 'bài',
  'nội', 'dung', 'please', 'this', 'that', 'of', 'the', 'an', 'about',
  'content', 'main', 'for', 'me', 'lesson', 'course', 'section', 'chapter',
  'module',
]);
