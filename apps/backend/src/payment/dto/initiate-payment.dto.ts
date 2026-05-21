import { IsString, IsUUID } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsString()
  gateway: string;

  @IsString()
  returnUrl: string;
}
