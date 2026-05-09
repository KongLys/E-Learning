import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayService } from './vnpay/vnpay.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { OrderPaidEvent } from '../enrollment/enrollment.listener';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private vnpayService: VnpayService,
    private eventEmitter: EventEmitter2,
  ) {}

  async initiatePayment(userId: string, dto: InitiatePaymentDto, ipAddr: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');
    if (order.status !== 'pending') throw new UnprocessableEntityException('Order is not in pending state');

    await this.prisma.payment.upsert({
      where: { orderId: order.id },
      update: { status: 'initiated' },
      create: { orderId: order.id, amount: Number(order.totalAmount), gateway: dto.gateway },
    });

    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'processing' } });

    const courseIds = order.items.map((i) => i.courseId).join(', ');
    const orderInfo = `Thanh toan khoa hoc: ${courseIds}`;
    const paymentUrl = this.vnpayService.buildPaymentUrl(
      order.id,
      Number(order.totalAmount),
      orderInfo,
      dto.returnUrl,
      ipAddr,
    );

    return { paymentUrl };
  }

  async handleIPN(query: Record<string, string>) {
    const isValid = this.vnpayService.verifyCallback(query);
    if (!isValid) return { RspCode: '97', Message: 'Invalid signature' };

    const orderId = query['vnp_TxnRef'];
    const responseCode = query['vnp_ResponseCode'];
    const gatewayTxnId = query['vnp_TransactionNo'];
    const vnpAmount = Number(query['vnp_Amount']) / 100;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, items: true },
    });
    if (!order) return { RspCode: '01', Message: 'Order not found' };

    if (Number(order.totalAmount) !== vnpAmount) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    if (order.payment?.status === 'success') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (responseCode === '00') {
      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'success', gatewayTxnId, rawResponse: query as any },
      });
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'paid', paidAt: new Date() },
      });

      for (const item of order.items) {
        this.eventEmitter.emit('order.paid', new OrderPaidEvent(order.userId, item.courseId));
      }
    } else {
      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'failed', rawResponse: query as any },
      });
      await this.prisma.order.update({ where: { id: orderId }, data: { status: 'failed' } });
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  handleReturn(query: Record<string, string>): { success: boolean } {
    const isValid = this.vnpayService.verifyCallback(query);
    if (!isValid) return { success: false };
    return { success: query['vnp_ResponseCode'] === '00' };
  }
}
