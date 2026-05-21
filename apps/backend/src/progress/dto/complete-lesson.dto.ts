import { IsUUID } from 'class-validator';

export class CompleteLessonDto {
  @IsUUID()
  lessonId: string;
}
