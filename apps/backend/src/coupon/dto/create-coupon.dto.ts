import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  code: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  discountPct: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class BulkCreateCouponRowDto {
  code: string;
  courseId?: string;
  discountPct: number;
  maxUses?: number;
  expiresAt?: string;
}
