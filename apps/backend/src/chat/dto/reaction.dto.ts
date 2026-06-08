import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji: string;
}
