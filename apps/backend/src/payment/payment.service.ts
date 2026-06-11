import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { SepayService } from './sepay/sepay.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';
import { OrderPaidEvent } from '../enrollment/enrollment.listener';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private sepayService: SepayService,
    private eventEmitter: EventEmitter2,
  ) {}

  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');
    if (order.status !== 'pending')
      throw new UnprocessableEntityException('Order is not in pending state');

    const transferCode = this.sepayService.generateTransferCode();
    const amount = Number(order.totalAmount);

    await this.prisma.payment.upsert({
      where: { orderId: order.id },
      update: { status: 'initiated', gateway: 'sepay', transferCode },
      create: { orderId: order.id, amount, gateway: 'sepay', transferCode },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'processing' },
    });

    const qrUrl = this.sepayService.buildQrUrl(amount, transferCode);
    const account = this.sepayService.getAccountInfo();

    return {
      orderId: order.id,
      qrUrl,
      transferCode,
      amount,
      currency: order.currency,
      ...account,
    };
  }

  /**
   * Webhook SePay gọi khi có tiền vào tài khoản ngân hàng.
   * Trả về 200 với { success } trong hầu hết trường hợp để SePay không retry vô hạn;
   * chỉ ném 401 khi API key sai.
   */
  async handleWebhook(payload: SepayWebhookDto, authHeader?: string) {
    if (!this.sepayService.verifyApiKey(authHeader)) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Chỉ xử lý giao dịch tiền vào.
    if (payload.transferType !== 'in') {
      return { success: true };
    }

    const transferCode = this.sepayService.extractTransferCode(payload.content);
    if (!transferCode) {
      this.logger.warn(
        `SePay webhook: no transfer code in content "${payload.content}"`,
      );
      return { success: false };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { transferCode },
      include: { order: { include: { items: true } } },
    });
    if (!payment) {
      this.logger.warn(
        `SePay webhook: no payment for transferCode ${transferCode}`,
      );
      return { success: false };
    }

    const order = payment.order;

    // Idempotent: bỏ qua nếu đã ghi nhận thành công.
    if (payment.status === 'success') {
      return { success: true };
    }

    // Kiểm tra số tiền chuyển đủ.
    if (Number(payload.transferAmount) < Number(order.totalAmount)) {
      this.logger.warn(
        `SePay webhook: insufficient amount for ${transferCode} (got ${payload.transferAmount}, need ${order.totalAmount})`,
      );
      return { success: false };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'success',
        gatewayTxnId: payload.referenceCode ?? String(payload.id),
        rawResponse: payload as any,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    for (const item of order.items) {
      this.eventEmitter.emit(
        'order.paid',
        new OrderPaidEvent(order.userId, item.courseId),
      );
    }

    return { success: true };
  }
}
