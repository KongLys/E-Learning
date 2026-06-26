import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstructorApplicationStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { StorageService } from '../storage/storage.service';
import { ApplyInstructorDto } from './dto/apply-instructor.dto';

/** Ảnh/PDF bằng cấp hợp lệ. */
const ALLOWED_CREDENTIAL_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

interface CredentialFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

@Injectable()
export class InstructorApplicationService {
  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
    private storage: StorageService,
  ) {}

  /** Học viên gửi đơn đăng ký làm giảng viên (kèm file bằng cấp tùy chọn). */
  async apply(
    userId: string,
    dto: ApplyInstructorDto,
    files?: Express.Multer.File[],
  ) {
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

    if (!files?.length) {
      throw new BadRequestException(
        'Vui lòng đính kèm ít nhất một ảnh hoặc tệp PDF bằng cấp / chứng chỉ',
      );
    }

    const credentialFiles = await this.uploadCredentials(userId, files);

    return this.prisma.instructorApplication.create({
      data: {
        userId,
        expertise: dto.expertise,
        experience: dto.experience,
        qualifications: dto.qualifications ?? null,
        motivation: dto.motivation,
        credentialFiles: credentialFiles as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Tải các file bằng cấp lên storage, trả về metadata để lưu dạng Json. */
  private async uploadCredentials(
    userId: string,
    files?: Express.Multer.File[],
  ): Promise<CredentialFile[]> {
    if (!files?.length) return [];

    return Promise.all(
      files.map(async (file) => {
        if (!ALLOWED_CREDENTIAL_MIME.includes(file.mimetype)) {
          throw new BadRequestException(
            'Bằng cấp chỉ chấp nhận ảnh (JPEG, PNG, WebP) hoặc tệp PDF',
          );
        }
        const ext =
          file.mimetype === 'application/pdf'
            ? 'pdf'
            : file.mimetype.split('/')[1];
        const key = `instructor-credentials/${userId}/${randomUUID()}.${ext}`;
        const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);
        return {
          url,
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
        };
      }),
    );
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
