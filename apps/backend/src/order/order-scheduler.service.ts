import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// Orders không được thanh toán sau 10 phút (khớp với EXPIRE_SECONDS frontend) sẽ bị expire.
const ORDER_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleOrders() {
    const cutoff = new Date(Date.now() - ORDER_TTL_MS);

    // Lấy danh sách các order cần expire để cập nhật cả Payment liên quan.
    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });

    if (staleOrders.length === 0) return;

    const ids = staleOrders.map((o) => o.id);

    await this.prisma.$transaction([
      this.prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { status: 'expired' },
      }),
      this.prisma.payment.updateMany({
        where: {
          orderId: { in: ids },
          status: 'initiated',
        },
        data: { status: 'failed' },
      }),
    ]);

    this.logger.log(`Expired ${staleOrders.length} stale orders`);
  }
}
