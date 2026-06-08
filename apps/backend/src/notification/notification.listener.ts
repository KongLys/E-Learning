import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationListener {
  constructor(
    private notifService: NotificationService,
    private gateway: NotificationGateway,
    private prisma: PrismaService,
  ) {}

  @OnEvent('order.paid')
  async onOrderPaid(event: { userId: string; courseIds: string[] }) {
    const courses = await this.prisma.course.findMany({
      where: { id: { in: event.courseIds } },
      select: { title: true },
    });
    const titles = courses.map((c) => c.title).join(', ');
    const notif = await this.notifService.create(
      event.userId,
      'enrollment',
      'Đăng ký thành công',
      `Bạn đã đăng ký thành công khóa học: ${titles}`,
      '/my-courses',
    );
    this.gateway.pushToUser(event.userId, notif);
  }

  @OnEvent('question.created')
  async onQuestionCreated(event: { instructorId: string; lessonTitle: string; questionId: string }) {
    const notif = await this.notifService.create(
      event.instructorId,
      'quick_question',
      'Câu hỏi mới',
      `Học viên đặt câu hỏi trong bài "${event.lessonTitle}"`,
      '/instructor/questions',
    );
    this.gateway.pushToUser(event.instructorId, notif);
  }

  @OnEvent('question.answered')
  async onQuestionAnswered(event: { studentId: string; questionId: string }) {
    const notif = await this.notifService.create(
      event.studentId,
      'question_answered',
      'Câu hỏi được trả lời',
      'Giảng viên đã trả lời câu hỏi của bạn',
    );
    this.gateway.pushToUser(event.studentId, notif);
  }

  @OnEvent('moderation.rejected')
  async onModerationRejected(event: {
    ownerId: string;
    contentType: 'course' | 'material';
    contentId: string;
    title: string;
    courseId?: string;
    status: 'rejected' | 'pending';
    reason?: string;
  }) {
    const isMaterial = event.contentType === 'material';
    const pending = event.status === 'pending';
    const link = isMaterial
      ? `/instructor/courses/${event.courseId ?? ''}/materials`
      : `/instructor/courses/${event.contentId}/edit`;
    const notif = await this.notifService.create(
      event.ownerId,
      'moderation_rejected',
      pending ? 'Nội dung đang chờ kiểm duyệt' : 'Nội dung không phù hợp',
      `${isMaterial ? 'Tài liệu' : 'Khóa học'} "${event.title}": ${event.reason ?? 'Không phù hợp với quy định.'}${pending ? '' : ' Bạn có thể kiến nghị duyệt lại.'}`,
      link,
    );
    this.gateway.pushToUser(event.ownerId, notif);
  }

  @OnEvent('moderation.appeal')
  async onModerationAppeal(event: {
    contentType: 'course' | 'material';
    contentId: string;
    title: string;
  }) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
    });
    const label = event.contentType === 'material' ? 'tài liệu' : 'khóa học';
    await Promise.all(
      admins.map(async (admin) => {
        const notif = await this.notifService.create(
          admin.id,
          'moderation_appeal',
          'Kiến nghị duyệt lại nội dung',
          `Có kiến nghị duyệt lại ${label} "${event.title}".`,
          '/admin/moderation',
        );
        this.gateway.pushToUser(admin.id, notif);
      }),
    );
  }

  @OnEvent('moderation.resolved')
  async onModerationResolved(event: {
    ownerId: string;
    contentType: 'course' | 'material';
    contentId: string;
    title: string;
    decision: 'approved' | 'locked';
    reason?: string;
  }) {
    const label = event.contentType === 'material' ? 'Tài liệu' : 'Khóa học';
    const approved = event.decision === 'approved';
    const notif = await this.notifService.create(
      event.ownerId,
      'moderation_resolved',
      approved ? 'Nội dung đã được duyệt' : 'Nội dung bị từ chối',
      approved
        ? `${label} "${event.title}" đã được duyệt và có thể sử dụng.`
        : `${label} "${event.title}" đã bị từ chối${event.reason ? `: ${event.reason}` : ''}. Bạn không thể kiến nghị lại.`,
    );
    this.gateway.pushToUser(event.ownerId, notif);
  }
}
