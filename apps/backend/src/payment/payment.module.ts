import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SepayService } from './sepay/sepay.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, SepayService],
})
export class PaymentModule {}
