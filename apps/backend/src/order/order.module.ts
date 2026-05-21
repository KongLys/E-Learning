import { Module } from '@nestjs/common';
import { OrderController, AdminOrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
