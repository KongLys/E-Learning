import { IsString } from 'class-validator';

export class CreateReplyDto {
  @IsString()
  content: string;
}
