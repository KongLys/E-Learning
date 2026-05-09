import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PositionType } from '../../note/dto/create-note.dto';

export class CreateQuickQuestionDto {
  @IsUUID()
  lessonId: string;

  @IsString()
  content: string;

  @IsEnum(PositionType)
  positionType: PositionType;

  @IsInt()
  @Min(0)
  positionValue: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
