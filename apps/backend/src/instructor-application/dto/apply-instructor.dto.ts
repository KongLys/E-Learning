import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplyInstructorDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  expertise: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  experience: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qualifications?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivation: string;
}
