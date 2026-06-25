import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstructorApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ApplyInstructorDto } from './dto/apply-instructor.dto';

@Injectable()
export class InstructorApplicationService {
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
  ) {}

  /** Học viên gửi đơn đăng ký làm giảng viên. */
  async apply(userId: string, dto: ApplyInstructorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'student') {
      throw new BadRequestException(
        'Chỉ tài khoản học viên mới được đăng ký làm giảng viên',
      );
    }

    const pending = await this.prisma.instructorApplication.findFirst({
      where: { userId, status: InstructorApplicationStatus.pending },
    });
    if (pending) {
      throw new ConflictException('Bạn đã có đơn đang chờ duyệt');
    }

    return this.prisma.instructorApplication.create({
      data: {
        userId,
        expertise: dto.expertise,
        experience: dto.experience,
        motivation: dto.motivation,
      },
    });
  }

  /** Đơn mới nhất của học viên (null nếu chưa từng nộp). */
  async getMine(userId: string) {
    return this.prisma.instructorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Danh sách đơn cho admin xét duyệt (mặc định pending). */
  async listForReview(query: { status?: string }) {
    const where: { status?: InstructorApplicationStatus } = {};
    const status = query.status ?? 'pending';
    if (this.isValidStatus(status)) {
      where.status = status;
    }
    return this.prisma.instructorApplication.findMany({
      where,
      include: {
        user: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin duyệt: set approved + nâng role học viên lên instructor. */
  async approve(applicationId: string, adminId: string) {
    const application = await this.requirePending(applicationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const app = await tx.instructorApplication.update({
        where: { id: applicationId },
        data: {
          status: InstructorApplicationStatus.approved,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: application.userId },
        data: { role: 'instructor' },
      });
      return app;
    });

    await this.notification.create(
      application.userId,
      'instructor_application',
      'Đơn đăng ký giảng viên được duyệt',
      'Chúc mừng! Bạn đã trở thành giảng viên và có thể bắt đầu tạo khóa học.',
      '/instructor/dashboard',
    );

    return updated;
  }

  /** Admin từ chối: set rejected + lưu lý do; học viên được nộp lại. */
  async reject(applicationId: string, adminId: string, reason?: string) {
    const application = await this.requirePending(applicationId);

    const updated = await this.prisma.instructorApplication.update({
      where: { id: applicationId },
      data: {
        status: InstructorApplicationStatus.rejected,
        rejectReason: reason ?? null,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.notification.create(
      application.userId,
      'instructor_application',
      'Đơn đăng ký giảng viên bị từ chối',
      reason
        ? `Lý do: ${reason}`
        : 'Đơn của bạn chưa được chấp thuận. Bạn có thể chỉnh sửa và nộp lại.',
      '/settings/become-instructor',
    );

    return updated;
  }

  private async requirePending(applicationId: string) {
    const application = await this.prisma.instructorApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new NotFoundException('Không tìm thấy đơn đăng ký');
    if (application.status !== InstructorApplicationStatus.pending) {
      throw new BadRequestException('Đơn này đã được xử lý');
    }
    return application;
  }

  private isValidStatus(s: string): s is InstructorApplicationStatus {
    return (['pending', 'approved', 'rejected'] as string[]).includes(s);
  }
}
