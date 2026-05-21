import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from 'class-validator';

class AnswerItemDto {
  @IsUUID()
  questionId: string;

  @IsArray()
  @IsUUID('all', { each: true })
  optionIds: string[];
}

export class SubmitAttemptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
