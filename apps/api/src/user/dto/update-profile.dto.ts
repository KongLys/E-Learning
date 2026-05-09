import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(0[3-9][0-9]{8})$/, { message: 'Invalid Vietnamese phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
