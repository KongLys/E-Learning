import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetMessagesDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
