import { IsInt, IsUUID, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsUUID()
  lessonId: string;

  @IsInt()
  @Min(0)
  lastPositionSec: number;

  @IsInt()
  @Min(0)
  watchTimeSec: number;
}
