import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RagService, Citation } from './rag/rag.service';
import { ChunkScope } from './vector/vector-store.service';
import { ChatQuizService, CreatedQuizInfo } from './chat-quiz.service';
import { neutralizeInline, MAX_USER_QUERY_LEN } from './prompt-safety.util';
import { GuardrailService } from './guard/guardrail.service';
import { REFUSAL_MESSAGE, scrubOutput } from './guard/injection-guard.util';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private prisma: PrismaService,
    private rag: RagService,
    private chatQuiz: ChatQuizService,
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
      function* refusalStream(): Generator<string> {
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

    // Run RAG pipeline (có thể giới hạn phạm vi theo Phần/Bài)
    const result = await this.rag.ask(
      conv.courseId,
      effectiveQuery,
      formattedHistory,
      scope,
    );

    // Guardrail đầu ra: gỡ marker nội bộ / đoạn rò rỉ system prompt nếu model echo.
    async function* scrubbedStream(
      src: AsyncIterable<string>,
    ): AsyncGenerator<string> {
      for await (const piece of src) yield scrubOutput(piece);
    }

    return {
      stream: scrubbedStream(result.stream),
      citations: result.citations,
      conversationId: conv.id,
      persist: (fullText: string) =>
        persistAssistant(fullText, result.citations)(),
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
