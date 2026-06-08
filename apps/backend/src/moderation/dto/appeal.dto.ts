import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AppealDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
