import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post()
  createOrder(
    @CurrentUser() u: { userId: string; role: string },
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(u.userId, u.role, dto);
  }

  @Get()
  getOrders(@CurrentUser() u: { userId: string }) {
    return this.orderService.getOrders(u.userId);
  }

  @Get(':id')
  getOrderById(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.orderService.getOrderById(id, u.userId, u.role);
  }

  @Post(':id/cancel')
  cancelOrder(
    @CurrentUser() u: { userId: string },
    @Param('id') id: string,
  ) {
    return this.orderService.cancelOrder(id, u.userId);
  }
}

@Controller('admin/orders')
export class AdminOrderController {
  constructor(private orderService: OrderService) {}

  @Get()
  @Roles('admin')
  getAdminOrders(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orderService.getAdminOrders(
      status,
      page ? +page : 1,
      limit ? +limit : 20,
    );
  }

  @Post(':id/refund')
  @Roles('admin')
  refundOrder(@Param('id') id: string) {
    return this.orderService.refundOrder(id);
  }
}
