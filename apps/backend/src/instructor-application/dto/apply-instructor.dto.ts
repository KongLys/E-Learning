import { IsString, MinLength, MaxLength } from 'class-validator';

export class ApplyInstructorDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  expertise: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  experience: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivation: string;
}
