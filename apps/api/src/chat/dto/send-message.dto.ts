import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsEnum(['text', 'image'])
  messageType: 'text' | 'image' = 'text';
}
