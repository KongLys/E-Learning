import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async createOrder(userId: string, userRole: string, dto: CreateOrderDto) {
    if (userRole === 'admin') throw new ForbiddenException('Admin không thể mua khóa học');

    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { items: { include: { course: { select: { id: true, title: true } } } } } });
    if (existing) return this.formatOrder(existing);

    const courses = await this.prisma.course.findMany({
      where: { id: { in: dto.courseIds }, status: 'published' },
    });
    if (courses.length !== dto.courseIds.length) throw new NotFoundException('One or more courses not found or not published');

    if (courses.some((c) => c.instructorId === userId)) {
      throw new ForbiddenException('Bạn không thể mua khóa học của chính mình');
    }

    for (const courseId of dto.courseIds) {
      const enrolled = await this.prisma.enrollment.findFirst({ where: { studentId: userId, courseId } });
      if (enrolled) throw new ConflictException(`Already enrolled in course ${courseId}`);
    }

    const totalAmount = courses.reduce((sum, c) => sum + Number(c.price), 0);
    if (totalAmount === 0) throw new UnprocessableEntityException('Cannot create order for free courses — use direct enrollment');

    const order = await this.prisma.order.create({
      data: {
        userId,
        totalAmount,
        idempotencyKey: dto.idempotencyKey,
        items: {
          create: courses.map((c) => ({ courseId: c.id, price: Number(c.price) })),
        },
      },
      include: { items: { include: { course: { select: { id: true, title: true } } } } },
    });

    return this.formatOrder(order);
  }

  async getOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: { items: { include: { course: { select: { id: true, title: true, thumbnailUrl: true } } } }, payment: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(this.formatOrder);
  }

  async getOrderById(orderId: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { course: { select: { id: true, title: true, thumbnailUrl: true } } } }, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (userRole !== 'admin' && order.userId !== userId) throw new ForbiddenException('Access denied');
    return this.formatOrder(order);
  }

  async getAdminOrders(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as any } : {};
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: { include: { course: { select: { id: true, title: true } } } }, payment: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { orders: orders.map(this.formatOrder), total, page, limit };
  }

  async refundOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'paid') throw new UnprocessableEntityException('Only paid orders can be refunded');

    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'refunded' } });
    if (order.payment) {
      await this.prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'refunded' } });
    }
    return { message: 'Order refunded' };
  }

  private formatOrder(order: any) {
    return {
      orderId: order.id,
      totalAmount: Number(order.totalAmount),
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
