import { IsString } from 'class-validator';

export class UpdateNoteDto {
  @IsString()
  content: string;
}
