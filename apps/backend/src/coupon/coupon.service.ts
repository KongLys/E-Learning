import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateCouponRowDto, CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoupons(instructorId: string) {
    return this.prisma.coupon.findMany({
      where: { instructorId },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCoupon(instructorId: string, dto: CreateCouponDto) {
    if (dto.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: dto.courseId, instructorId },
      });
      if (!course) throw new ForbiddenException('Course not found or not yours');
    }

    const exists = await this.prisma.coupon.findUnique({ where: { code: dto.code.toUpperCase() } });
    if (exists) throw new BadRequestException('Coupon code already exists');

    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        instructorId,
        courseId: dto.courseId ?? null,
        discountPct: dto.discountPct,
        maxUses: dto.maxUses ?? 0,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: { course: { select: { id: true, title: true } } },
    });
  }

  async bulkCreate(instructorId: string, rows: BulkCreateCouponRowDto[]) {
    const myCourseIds = (
      await this.prisma.course.findMany({
        where: { instructorId },
        select: { id: true },
      })
    ).map((c) => c.id);

    const results: { code: string; success: boolean; error?: string }[] = [];

    for (const row of rows) {
      try {
        if (!row.code || row.code.trim().length < 3) {
          results.push({ code: row.code, success: false, error: 'Code quá ngắn' });
          continue;
        }
        if (row.courseId && !myCourseIds.includes(row.courseId)) {
          results.push({ code: row.code, success: false, error: 'Course không thuộc về bạn' });
          continue;
        }
        const exists = await this.prisma.coupon.findUnique({ where: { code: row.code.toUpperCase() } });
        if (exists) {
          results.push({ code: row.code, success: false, error: 'Code đã tồn tại' });
          continue;
        }
        await this.prisma.coupon.create({
          data: {
            code: row.code.toUpperCase(),
            instructorId,
            courseId: row.courseId ?? null,
            discountPct: Number(row.discountPct) || 10,
            maxUses: Number(row.maxUses) || 0,
            expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
          },
        });
        results.push({ code: row.code, success: true });
      } catch {
        results.push({ code: row.code, success: false, error: 'Lỗi tạo coupon' });
      }
    }

    return results;
  }

  async deleteCoupon(instructorId: string, couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon.instructorId !== instructorId) throw new ForbiddenException('Access denied');
    await this.prisma.coupon.delete({ where: { id: couponId } });
  }

  async getCoursesExport(instructorId: string): Promise<string> {
    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    });
    const lines = [
      'courseId,courseTitle',
      ...courses.map((c) => `${c.id},"${c.title.replace(/"/g, '""')}"`),
    ];
    return lines.join('\n');
  }

  async validateCoupon(
    code: string,
    courseId: string,
  ): Promise<{ discountPct: number; couponId: string } | null> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) return null;
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return null;
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return null;
    if (coupon.courseId && coupon.courseId !== courseId) return null;
    return { discountPct: coupon.discountPct, couponId: coupon.id };
  }

  async incrementUsed(couponId: string) {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
