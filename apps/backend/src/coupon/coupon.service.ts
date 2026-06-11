import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkCreateCouponRowDto,
  CreateCouponDto,
} from './dto/create-coupon.dto';

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
      if (!course)
        throw new ForbiddenException('Course not found or not yours');
    }

    const exists = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
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
          results.push({
            code: row.code,
            success: false,
            error: 'Code quá ngắn',
          });
          continue;
        }
        if (row.courseId && !myCourseIds.includes(row.courseId)) {
          results.push({
            code: row.code,
            success: false,
            error: 'Course không thuộc về bạn',
          });
          continue;
        }
        const exists = await this.prisma.coupon.findUnique({
          where: { code: row.code.toUpperCase() },
        });
        if (exists) {
          results.push({
            code: row.code,
            success: false,
            error: 'Code đã tồn tại',
          });
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
        results.push({
          code: row.code,
          success: false,
          error: 'Lỗi tạo coupon',
        });
      }
    }

    return results;
  }

  async deleteCoupon(instructorId: string, couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon.instructorId !== instructorId)
      throw new ForbiddenException('Access denied');
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

  /**
   * Tìm coupon theo code và kiểm tra mọi điều kiện áp dụng cho một khóa cụ thể.
   * Ném BadRequest với thông báo tiếng Việt để frontend hiển thị trực tiếp.
   */
  private async resolveValidCoupon(
    code: string,
    course: { id: string; instructorId: string },
  ) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon) throw new BadRequestException('Mã giảm giá không tồn tại');
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    // Mã của instructor chỉ áp được cho khóa do chính họ giảng dạy.
    if (coupon.instructorId !== course.instructorId)
      throw new BadRequestException('Mã không áp dụng cho khóa học này');
    // Mã gắn với một khóa cụ thể thì phải đúng khóa đó.
    if (coupon.courseId && coupon.courseId !== course.id)
      throw new BadRequestException('Mã không áp dụng cho khóa học này');
    return coupon;
  }

  private computeDiscount(price: number, discountPct: number) {
    return Math.min(price, Math.round((price * discountPct) / 100));
  }

  /**
   * Học viên xem trước hiệu lực của mã trước khi mua.
   * Trả về số tiền giảm và giá cuối; ném lỗi nếu mã không hợp lệ.
   */
  async previewCoupon(code: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, price: true, instructorId: true, status: true },
    });
    if (!course || course.status !== 'published')
      throw new NotFoundException('Khóa học không tồn tại');

    const coupon = await this.resolveValidCoupon(code, course);
    const originalAmount = Number(course.price);
    const discountAmount = this.computeDiscount(
      originalAmount,
      coupon.discountPct,
    );
    return {
      code: coupon.code,
      discountPct: coupon.discountPct,
      originalAmount,
      discountAmount,
      finalAmount: originalAmount - discountAmount,
    };
  }

  /**
   * Áp mã cho một khóa khi tạo đơn hàng (gọi từ OrderService).
   * Re-validate tại thời điểm đặt hàng để chống điều kiện đua.
   */
  async applyCouponToCourse(
    code: string,
    course: { id: string; instructorId: string; price: unknown },
  ) {
    const coupon = await this.resolveValidCoupon(code, course);
    const discountAmount = this.computeDiscount(
      Number(course.price),
      coupon.discountPct,
    );
    return { code: coupon.code, couponId: coupon.id, discountAmount };
  }

  /** Ghi nhận đã sử dụng 1 lượt — gọi khi đơn hàng thanh toán thành công. */
  async redeemByCode(code: string) {
    await this.prisma.coupon.updateMany({
      where: { code: code.trim().toUpperCase() },
      data: { usedCount: { increment: 1 } },
    });
  }
}
