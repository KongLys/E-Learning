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
}
