import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { Citation } from '../rag/rag.service';
import { CreatedQuizInfo } from '../quiz/chat-quiz.service';

interface AskBody {
  query: string;
  /** Giới hạn phạm vi truy vấn theo Phần hoặc Bài (tùy chọn). */
  sectionId?: string;
  lessonId?: string;
}

interface ExplainQuizBody {
  questionId: string;
  pickedOptionIds: string[];
}

interface CreateConversationBody {
  title?: string;
}

/** Kết quả streaming dùng chung cho `ask` và `explain-quiz`. */
interface StreamResult {
  stream: AsyncIterable<string>;
  citations: Citation[];
  persist: (full: string) => Promise<void>;
  getQuiz?: () => CreatedQuizInfo | null;
}

@Controller()
export class AiChatController {
  constructor(private chat: AiChatService) {}

  @Post('courses/:courseId/ai/conversations')
  createConversation(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
    @Body() body: CreateConversationBody,
  ) {
    return this.chat.createConversation(courseId, user.userId, body.title);
  }

  @Get('courses/:courseId/ai/conversations')
  listConversations(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.chat.listConversations(courseId, user.userId);
  }

  @Get('ai/conversations/:id/messages')
  getMessages(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.chat.getMessages(id, user.userId);
  }

  @Post('ai/conversations/:id/ask')
  async ask(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: AskBody,
    @Res() res: Response,
  ) {
    const scope =
      body.sectionId || body.lessonId
        ? { sectionId: body.sectionId, lessonId: body.lessonId }
        : undefined;
    const result = await this.chat.ask(id, user.userId, body.query, scope);
    await this.streamSse(res, result);
  }

  @Post('ai/conversations/:id/explain-quiz')
  async explainQuiz(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ExplainQuizBody,
    @Res() res: Response,
  ) {
    const result = await this.chat.explainQuizAnswer(id, user.userId, body);
    await this.streamSse(res, result);
  }

  /** Đẩy kết quả LLM (citations → token → quiz → done) qua SSE, persist khi xong. */
  private async streamSse(res: Response, result: StreamResult) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(
      `event: citations\ndata: ${JSON.stringify(this.chat.serializeCitations(result.citations))}\n\n`,
    );

    let full = '';
    try {
      for await (const piece of result.stream) {
        full += piece;
        res.write(`event: token\ndata: ${JSON.stringify(piece)}\n\n`);
      }
      await result.persist(full);
      const quiz = result.getQuiz?.();
      if (quiz) {
        res.write(`event: quiz\ndata: ${JSON.stringify(quiz)}\n\n`);
      }
      res.write(
        `event: done\ndata: ${JSON.stringify({ length: full.length })}\n\n`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    } finally {
      res.end();
    }
  }
}
