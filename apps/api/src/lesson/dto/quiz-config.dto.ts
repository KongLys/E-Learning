import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QuizConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passingScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAttempts?: number;
}
