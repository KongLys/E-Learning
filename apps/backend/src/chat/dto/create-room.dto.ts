import { IsUUID } from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  instructorId: string;

  @IsUUID()
  courseId: string;
}
