import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

// Ngưỡng phát hiện học viên trễ tiến độ.
const GRACE_WEEKS = 1; // Ân hạn tuần đầu, không nhắc quá sớm.
const GAP_THRESHOLD = 25; // Chênh lệch (điểm %) giữa kỳ vọng và thực tế để coi là trễ.
const MIN_INACTIVE_DAYS = 7; // Đã ngưng học ít nhất bấy nhiêu ngày.
const REMINDER_COOLDOWN_DAYS = 7; // Mỗi học viên tối đa 1 email trong khoảng này.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

@Injectable()
export class ProgressReminderSchedulerService {
  private readonly logger = new Logger(ProgressReminderSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendProgressReminders() {
    const now = Date.now();

    // Ứng viên: đang học dở, khóa học có đặt số tuần đề xuất.
    const candidates = await this.prisma.enrollment.findMany({
      where: {
        status: 'active',
        progressPercent: { lt: 100 },
        course: { recommendedWeeks: { gt: 0 } },
      },
      select: {
        id: true,
        enrolledAt: true,
        progressPercent: true,
        lastReminderAt: true,
        student: { select: { email: true, fullName: true } },
        course: {
          select: { title: true, slug: true, recommendedWeeks: true },
        },
      },
    });

    if (candidates.length === 0) return;

    // Lấy thời điểm hoạt động gần nhất của cả lô bằng 1 query (tránh N+1).
    const ids = candidates.map((c) => c.id);
    const lastActivityRows = await this.prisma.lessonProgress.groupBy({
      by: ['enrollmentId'],
      where: { enrollmentId: { in: ids } },
      _max: { updatedAt: true },
    });
    const lastActivityMap = new Map<string, Date>();
    for (const row of lastActivityRows) {
      if (row._max.updatedAt) {
        lastActivityMap.set(row.enrollmentId, row._max.updatedAt);
      }
    }

    const frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');

    const toRemind: { id: string }[] = [];
    let sent = 0;

    for (const c of candidates) {
      const recommendedWeeks = c.course.recommendedWeeks ?? 0;
      if (recommendedWeeks <= 0 || !c.student.email) continue;

      const weeksElapsed = (now - c.enrolledAt.getTime()) / MS_PER_WEEK;
      if (weeksElapsed < GRACE_WEEKS) continue;

      const expectedPercent = Math.min(
        100,
        (weeksElapsed / recommendedWeeks) * 100,
      );
      const gap = expectedPercent - c.progressPercent;
      if (gap < GAP_THRESHOLD) continue;

      const lastActivity = lastActivityMap.get(c.id) ?? c.enrolledAt;
      const inactiveDays = (now - lastActivity.getTime()) / MS_PER_DAY;
      if (inactiveDays < MIN_INACTIVE_DAYS) continue;

      if (
        c.lastReminderAt &&
        now - c.lastReminderAt.getTime() < REMINDER_COOLDOWN_DAYS * MS_PER_DAY
      ) {
        continue;
      }

      try {
        await this.mail.sendProgressReminderEmail(c.student.email, {
          studentName: c.student.fullName,
          courseTitle: c.course.title,
          courseUrl: `${frontendUrl}/courses/${c.course.slug}`,
          progressPercent: c.progressPercent,
          expectedPercent,
        });
        toRemind.push({ id: c.id });
        sent += 1;
      } catch (err) {
        // 1 email lỗi không được chặn cả lô.
        this.logger.error(
          `Không gửi được email nhắc tiến độ cho enrollment ${c.id}: ${
            (err as Error).message
          }`,
        );
      }
    }

    if (toRemind.length > 0) {
      await this.prisma.enrollment.updateMany({
        where: { id: { in: toRemind.map((e) => e.id) } },
        data: { lastReminderAt: new Date() },
      });
    }

    this.logger.log(
      `Đã gửi ${sent} email nhắc trễ tiến độ (quét ${candidates.length} enrollment).`,
    );
  }
}
