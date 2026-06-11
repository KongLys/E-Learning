import { Module } from '@nestjs/common';
import { OrderController, AdminOrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { CouponModule } from '../coupon/coupon.module';

@Module({
  imports: [CouponModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService, OrderSchedulerService],
  exports: [OrderService],
})
export class OrderModule {}
