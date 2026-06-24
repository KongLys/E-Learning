import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Dữ liệu cần để render chứng chỉ PDF phía client. */
export interface CertificateView {
  code: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string | null;
  studentFullName: string;
  instructorName: string;
  issuedAt: Date;
}

/** Bảng chữ Crockford base32 (bỏ I, L, O, U để tránh nhầm lẫn). */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(private prisma: PrismaService) {}

  private generateCode(): string {
    const bytes = randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += BASE32[bytes[i] % 32];
    return `CERT-${out}`;
  }

  /**
   * Cấp chứng chỉ khi học viên hoàn thành khóa. Idempotent nhờ unique
   * (studentId, courseId): gọi lại nhiều lần cũng chỉ giữ một bản ghi.
   */
  async issueForCompletion(studentId: string, courseId: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (existing) return existing;

    // Vòng lặp phòng trường hợp trùng `code` (xác suất cực thấp).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.certificate.create({
          data: { studentId, courseId, code: this.generateCode() },
        });
      } catch (err: any) {
        // P2002: unique constraint. Nếu trùng (studentId, courseId) do race →
        // trả về bản ghi đã có; nếu trùng `code` → thử mã khác.
        if (err?.code === 'P2002') {
          const again = await this.prisma.certificate.findUnique({
            where: { studentId_courseId: { studentId, courseId } },
          });
          if (again) return again;
          continue;
        }
        throw err;
      }
    }
    throw new Error('Không thể sinh mã chứng chỉ duy nhất');
  }

  private toView(cert: {
    code: string;
    issuedAt: Date;
    courseId: string;
    course: {
      title: string;
      slug: string | null;
      instructor: { fullName: string } | null;
    };
    student: { fullName: string };
  }): CertificateView {
    return {
      code: cert.code,
      courseId: cert.courseId,
      courseTitle: cert.course.title,
      courseSlug: cert.course.slug ?? null,
      studentFullName: cert.student.fullName,
      instructorName: cert.course.instructor?.fullName ?? '',
      issuedAt: cert.issuedAt,
    };
  }

  private readonly include = {
    student: { select: { fullName: true } },
    course: {
      select: {
        title: true,
        slug: true,
        instructor: { select: { fullName: true } },
      },
    },
  } as const;

  /** Danh sách chứng chỉ của học viên (mới cấp trước). */
  async listMine(userId: string): Promise<CertificateView[]> {
    const certs = await this.prisma.certificate.findMany({
      where: { studentId: userId },
      orderBy: { issuedAt: 'desc' },
      include: this.include,
    });
    return certs.map((c) => this.toView(c));
  }

  /**
   * Lấy chứng chỉ của học viên cho một khóa. Lazy-create: nếu enrollment đã
   * `completed` mà chưa có chứng chỉ (khóa hoàn thành trước khi có tính năng)
   * thì cấp luôn. Nếu chưa hoàn thành → 404.
   */
  async getForCourse(userId: string, courseId: string): Promise<CertificateView> {
    let cert = await this.prisma.certificate.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
      include: this.include,
    });

    if (!cert) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId: userId, courseId } },
        select: { status: true },
      });
      if (enrollment?.status !== 'completed') {
        throw new NotFoundException('Bạn chưa hoàn thành khóa học này');
      }
      await this.issueForCompletion(userId, courseId);
      cert = await this.prisma.certificate.findUnique({
        where: { studentId_courseId: { studentId: userId, courseId } },
        include: this.include,
      });
    }

    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');
    return this.toView(cert);
  }

  /** Xác minh công khai theo mã — không lộ dữ liệu nhạy cảm. */
  async verify(code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { code },
      include: this.include,
    });
    if (!cert) return { valid: false as const };
    return {
      valid: true as const,
      code: cert.code,
      studentName: cert.student.fullName,
      courseTitle: cert.course.title,
      instructorName: cert.course.instructor?.fullName ?? '',
      issuedAt: cert.issuedAt,
    };
  }
}
