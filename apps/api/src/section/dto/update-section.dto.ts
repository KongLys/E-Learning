import { IsString, MinLength } from 'class-validator';

export class UpdateSectionDto {
  @IsString()
  @MinLength(2)
  title: string;
}
