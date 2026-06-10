import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

/** Payload webhook SePay (https://docs.sepay.vn/tich-hop-webhooks.html). */
export class SepayWebhookDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsIn(['in', 'out'])
  transferType: 'in' | 'out';

  @IsNumber()
  transferAmount: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
