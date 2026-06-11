import { Module } from '@nestjs/common';
import { OrderController, AdminOrderController } from './order.controller';
import { OrderService } from './order.service';
import { CouponModule } from '../coupon/coupon.module';

@Module({
  imports: [CouponModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
