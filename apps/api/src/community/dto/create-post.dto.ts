import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(['question', 'discussion', 'announcement'])
  type: 'question' | 'discussion' | 'announcement';
}
