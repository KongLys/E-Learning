import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('initiate')
  initiatePayment(
    @CurrentUser() u: { userId: string },
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
  ) {
    const ipAddr = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '127.0.0.1';
    return this.paymentService.initiatePayment(u.userId, dto, ipAddr);
  }

  @Public()
  @Get('vnpay-return')
  vnpayReturn(@Query() query: Record<string, string>) {
    return this.paymentService.handleReturn(query);
  }

  @Public()
  @Post('vnpay-ipn')
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.paymentService.handleIPN(query);
  }
}
