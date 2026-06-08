import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

export const MESSAGE_TYPES = ['text', 'image', 'file', 'audio', 'video'] as const;
export type MessageTypeValue = (typeof MESSAGE_TYPES)[number];

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(MESSAGE_TYPES)
  messageType?: MessageTypeValue;
}
