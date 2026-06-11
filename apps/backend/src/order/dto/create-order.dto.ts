import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  courseIds: string[];

  @IsString()
  idempotencyKey: string;

  @IsOptional()
  @IsString()
  discountCode?: string;
}
