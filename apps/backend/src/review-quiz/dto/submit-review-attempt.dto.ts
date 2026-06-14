import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ReviewAnswerItemDto {
  @IsUUID()
  questionId: string;

  @IsArray()
  @IsUUID('all', { each: true })
  optionIds: string[];
}

export class SubmitReviewAttemptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReviewAnswerItemDto)
  answers: ReviewAnswerItemDto[];
}
