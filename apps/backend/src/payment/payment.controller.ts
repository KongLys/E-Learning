import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('initiate')
  initiatePayment(@CurrentUser() u: { userId: string }, @Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePayment(u.userId, dto);
  }

  @Public()
  @Post('sepay/webhook')
  sepayWebhook(
    @Body() payload: SepayWebhookDto,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.paymentService.handleWebhook(payload, authHeader);
  }
}
