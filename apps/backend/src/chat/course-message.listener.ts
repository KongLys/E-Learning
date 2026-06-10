import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { stripHtml } from '../common/sanitize-html.util';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

/**
 * Delivers the instructor-authored automated course messages
 * (welcome / congratulations) as a 1-1 chat message from the instructor to the
 * student. Triggered by enrollment and course-completion events. Failures are
 * swallowed so they never break the enroll / progress flows.
 */
@Injectable()
export class CourseMessageListener {
  private readonly logger = new Logger(CourseMessageListener.name);

  constructor(
    private prisma: PrismaService,
    private chat: ChatService,
  ) {}

  @OnEvent('enrollment.created')
  async onEnrollmentCreated(event: { studentId: string; courseId: string }) {
    await this.deliver(event.courseId, event.studentId, 'welcome');
  }

  @OnEvent('course.completed')
  async onCourseCompleted(event: { studentId: string; courseId: string }) {
    await this.deliver(event.courseId, event.studentId, 'congratulations');
  }

  private async deliver(
    courseId: string,
    studentId: string,
    kind: 'welcome' | 'congratulations',
  ) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { instructorId: true, welcomeMessage: true, congratulationsMessage: true },
      });
      if (!course) return;

      const html = kind === 'welcome' ? course.welcomeMessage : course.congratulationsMessage;
      const content = htmlToPlainText(html);
      if (!content) return; // instructor left this message empty → nothing to send

      // The enrollment exists at this point, so the conversation guard passes.
      const conversation = await this.chat.getOrCreateConversation(course.instructorId, studentId);
      await this.chat.createMessage(conversation.id, course.instructorId, { content });
    } catch (err) {
      this.logger.warn(
        `Không thể gửi tin nhắn "${kind}" cho học viên ${studentId} (khóa ${courseId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

/** Convert the rich-text HTML to plain text, preserving paragraph/line breaks. */
function htmlToPlainText(html?: string | null): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return stripHtml(withBreaks).replace(/\n{3,}/g, '\n\n');
}
