import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['video', 'document', 'quiz'])
  type: 'video' | 'document' | 'quiz';

  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;
}
