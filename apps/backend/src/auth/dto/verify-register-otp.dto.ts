import { IsEmail, Length, Matches } from 'class-validator';

export class VerifyRegisterOtpDto {
  @IsEmail()
  email: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
