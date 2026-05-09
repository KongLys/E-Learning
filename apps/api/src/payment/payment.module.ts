import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { VnpayService } from './vnpay/vnpay.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, VnpayService],
})
export class PaymentModule {}
