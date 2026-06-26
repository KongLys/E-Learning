import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SepayService } from './sepay/sepay.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';
import { OrderPaidEvent } from '../enrollment/enrollment.listener';
import { CouponService } from '../coupon/coupon.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private sepayService: SepayService,
    private eventEmitter: EventEmitter2,
    private couponService: CouponService,
    private config: ConfigService,
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

    // TODO(dev): tạm thời tự động đánh dấu thanh toán thành công sau 5s vì
    // SePay không gọi webhook tới được máy local. Tắt bằng cách bỏ
    // PAYMENT_MOCK_AUTO_SUCCESS trong .env trước khi lên production.
    if (this.config.get<string>('PAYMENT_MOCK_AUTO_SUCCESS') === 'true') {
      this.logger.warn(
        `PAYMENT_MOCK_AUTO_SUCCESS bật: đơn ${order.id} sẽ tự thành công sau 5s`,
      );
      setTimeout(() => {
        this.markPaymentSuccessByTransferCode(transferCode).catch((err) =>
          this.logger.error(
            `Auto-success thất bại cho ${transferCode}: ${err}`,
          ),
        );
      }, 5_000);
    }

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

    await this.finalizeOrderPaid(
      payment.id,
      order,
      payload.referenceCode ?? String(payload.id),
      payload,
    );

    return { success: true };
  }

  /**
   * Chốt một đơn sang trạng thái đã thanh toán: cập nhật payment/order,
   * ghi nhận lượt dùng coupon và phát sự kiện order.paid để kích hoạt ghi danh.
   * Idempotent: bỏ qua nếu payment đã ở trạng thái success.
   */
  private async finalizeOrderPaid(
    paymentId: string,
    order: {
      id: string;
      userId: string;
      discountCode: string | null;
      items: { courseId: string }[];
    },
    gatewayTxnId: string,
    rawResponse?: unknown,
  ) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'success',
        gatewayTxnId,
        rawResponse: (rawResponse ?? undefined) as any,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    // Ghi nhận 1 lượt dùng mã giảm giá khi đơn thực sự được thanh toán
    // (không tính cho đơn bị bỏ dở ở trạng thái pending).
    if (order.discountCode) {
      await this.couponService.redeemByCode(order.discountCode);
    }

    for (const item of order.items) {
      this.eventEmitter.emit(
        'order.paid',
        new OrderPaidEvent(order.userId, item.courseId),
      );
    }
  }

  /**
   * Chỉ dùng cho dev (PAYMENT_MOCK_AUTO_SUCCESS): giả lập SePay báo tiền vào
   * để chốt đơn thành công mà không cần webhook thật.
   */
  private async markPaymentSuccessByTransferCode(transferCode: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { transferCode },
      include: { order: { include: { items: true } } },
    });
    if (!payment || payment.status === 'success') return;

    await this.finalizeOrderPaid(
      payment.id,
      payment.order,
      `MOCK-${transferCode}`,
    );
  }
}
