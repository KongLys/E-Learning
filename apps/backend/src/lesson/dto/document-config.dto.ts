import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DocumentConfigDto {
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minReadTimeSec?: number;
}
