import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService, Citation } from './rag/rag.service';

@Injectable()
export class AiChatService {
  constructor(
    private prisma: PrismaService,
    private rag: RagService,
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
      throw new ForbiddenException('You must be enrolled in this course to use AI chat');
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
    const conv = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.userId !== userId) throw new ForbiddenException('Access denied');
    return conv;
  }

  async ask(conversationId: string, userId: string, query: string) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Query is too short');
    }
    const conv = await this.loadConversation(conversationId, userId);

    // Load history (last 10 messages)
    const history = await this.prisma.aiMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const formattedHistory = history
      .reverse()
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);

    // Save user message
    await this.prisma.aiMessage.create({
      data: { conversationId: conv.id, role: 'user', content: query },
    });

    // Run RAG pipeline
    const result = await this.rag.ask(conv.courseId, query, formattedHistory);

    return {
      stream: result.stream,
      citations: result.citations,
      conversationId: conv.id,
      persist: async (fullText: string) => {
        await this.prisma.aiMessage.create({
          data: {
            conversationId: conv.id,
            role: 'assistant',
            content: fullText,
            citations: result.citations as unknown as object,
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
      },
    };
  }

  serializeCitations(citations: Citation[]) {
    return citations.map((c, i) => ({
      index: i + 1,
      chunkId: c.chunkId,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      materialId: c.materialId,
      lessonId: c.lessonId,
    }));
  }
}
