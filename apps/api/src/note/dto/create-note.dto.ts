import { IsEnum, IsInt, IsString, IsUUID, Min } from 'class-validator';

export enum PositionType {
  VIDEO_TIMESTAMP = 'video_timestamp',
  DOCUMENT_PAGE = 'document_page',
  NONE = 'none',
}

export class CreateNoteDto {
  @IsUUID()
  lessonId: string;

  @IsString()
  content: string;

  @IsEnum(PositionType)
  positionType: PositionType;

  @IsInt()
  @Min(0)
  positionValue: number;
}
