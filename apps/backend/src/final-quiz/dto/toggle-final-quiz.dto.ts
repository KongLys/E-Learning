import { IsBoolean } from 'class-validator';

export class ToggleFinalQuizDto {
  @IsBoolean()
  enabled!: boolean;
}
