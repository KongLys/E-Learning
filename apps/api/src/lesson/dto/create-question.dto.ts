import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuizOptionDto {
  @IsString()
  content: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsInt()
  @Min(1)
  orderIndex: number;
}

export class CreateQuestionDto {
  @IsString()
  content: string;

  @IsIn(['single', 'multiple', 'true_false'])
  questionType: 'single' | 'multiple' | 'true_false';

  @IsInt()
  @Min(1)
  orderIndex: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  options: QuizOptionDto[];
}
