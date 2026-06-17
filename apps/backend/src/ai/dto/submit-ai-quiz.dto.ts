import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class AiQuizAnswerItemDto {
  @IsUUID()
  questionId: string;

  @IsArray()
  @IsUUID('all', { each: true })
  optionIds: string[];
}

export class SubmitAiQuizDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AiQuizAnswerItemDto)
  answers: AiQuizAnswerItemDto[];
}
