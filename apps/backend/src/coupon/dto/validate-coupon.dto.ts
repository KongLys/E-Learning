import { IsString, IsUUID, MinLength } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @MinLength(3)
  code: string;

  @IsUUID()
  courseId: string;
}
