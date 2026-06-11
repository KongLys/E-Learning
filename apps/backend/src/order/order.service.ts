import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CouponService } from '../coupon/coupon.service';
import { OrderPaidEvent } from '../enrollment/enrollment.listener';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private couponService: CouponService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createOrder(userId: string, userRole: string, dto: CreateOrderDto) {
    if (userRole === 'admin')
      throw new ForbiddenException('Admin không thể mua khóa học');

    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        items: { include: { course: { select: { id: true, title: true } } } },
      },
    });
    if (existing) return this.formatOrder(existing);

    const courses = await this.prisma.course.findMany({
      where: { id: { in: dto.courseIds }, status: 'published' },
    });
    if (courses.length !== dto.courseIds.length)
      throw new NotFoundException(
        'One or more courses not found or not published',
      );

    if (courses.some((c) => c.instructorId === userId)) {
      throw new ForbiddenException('Bạn không thể mua khóa học của chính mình');
    }

    for (const courseId of dto.courseIds) {
      const enrolled = await this.prisma.enrollment.findFirst({
        where: { studentId: userId, courseId },
      });
      if (enrolled)
        throw new ConflictException(`Already enrolled in course ${courseId}`);
    }

    const totalAmount = courses.reduce((sum, c) => sum + Number(c.price), 0);
    if (totalAmount === 0)
      throw new UnprocessableEntityException(
        'Cannot create order for free courses — use direct enrollment',
      );

    // Áp mã giảm giá (nếu có). Coupon gắn theo từng khóa nên chỉ hỗ trợ đơn 1 khóa.
    let discountCode: string | null = null;
    let discountAmount = 0;
    if (dto.discountCode) {
      if (courses.length !== 1)
        throw new BadRequestException(
          'Mã giảm giá chỉ áp dụng cho đơn 1 khóa học',
        );
      const applied = await this.couponService.applyCouponToCourse(
        dto.discountCode,
        courses[0],
      );
      discountCode = applied.code;
      discountAmount = applied.discountAmount;
    }
    const finalAmount = Math.max(0, totalAmount - discountAmount);

    // Mã giảm 100% → đơn 0đ: tạo đơn đã thanh toán và ghi danh ngay,
    // không qua cổng thanh toán (SePay không xử lý 0đ).
    const isFullyDiscounted = discountCode !== null && finalAmount === 0;

    const order = await this.prisma.order.create({
      data: {
        userId,
        totalAmount: finalAmount,
        discountCode,
        discountAmount,
        idempotencyKey: dto.idempotencyKey,
        status: isFullyDiscounted ? 'paid' : 'pending',
        paidAt: isFullyDiscounted ? new Date() : null,
        items: {
          create: courses.map((c) => ({
            courseId: c.id,
            price: Number(c.price),
            // Discount chỉ áp cho đơn 1 khóa nên gán trọn cho item duy nhất.
            discount: discountCode ? discountAmount : 0,
          })),
        },
      },
      include: {
        items: { include: { course: { select: { id: true, title: true } } } },
      },
    });

    if (isFullyDiscounted && discountCode) {
      await this.couponService.redeemByCode(discountCode);
      for (const item of order.items) {
        this.eventEmitter.emit(
          'order.paid',
          new OrderPaidEvent(userId, item.courseId),
        );
      }
    }

    return this.formatOrder(order);
  }

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            course: { select: { id: true, title: true, thumbnailUrl: true } },
          },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.formatOrder);
  }

  async getOrderById(orderId: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            course: { select: { id: true, title: true, thumbnailUrl: true } },
          },
        },
        payment: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (userRole !== 'admin' && order.userId !== userId)
      throw new ForbiddenException('Access denied');
    return this.formatOrder(order);
  }

  async getAdminOrders(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as any } : {};
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: { include: { course: { select: { id: true, title: true } } } },
          payment: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { orders: orders.map(this.formatOrder), total, page, limit };
  }

  async refundOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'paid')
      throw new UnprocessableEntityException(
        'Only paid orders can be refunded',
      );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'refunded' },
    });
    if (order.payment) {
      await this.prisma.payment.update({
        where: { id: order.payment.id },
        data: { status: 'refunded' },
      });
    }
    return { message: 'Order refunded' };
  }

  private formatOrder(order: any) {
    return {
      orderId: order.id,
      totalAmount: Number(order.totalAmount),
      discountCode: order.discountCode ?? null,
      discountAmount: Number(order.discountAmount ?? 0),
      currency: order.currency,
      status: order.status,
      idempotencyKey: order.idempotencyKey,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      items: order.items?.map((item: any) => ({
        courseId: item.courseId,
        price: Number(item.price),
        title: item.course?.title,
      })),
      payment: order.payment,
    };
  }
}
