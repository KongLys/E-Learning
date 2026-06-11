import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'password must contain at least one uppercase letter and one number',
  })
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsIn(['student', 'instructor'])
  role: 'student' | 'instructor';
}
