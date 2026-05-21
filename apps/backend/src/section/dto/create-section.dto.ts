import { IsString, MinLength } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @MinLength(2)
  title: string;
}
