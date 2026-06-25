import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { ResendRegisterOtpDto } from './dto/resend-register-otp.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register/request-otp')
  requestRegisterOtp(@Body() dto: RegisterDto) {
    return this.authService.requestRegisterOtp(dto);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register/verify-otp')
  verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register/resend-otp')
  resendRegisterOtp(@Body() dto: ResendRegisterOtpDto) {
    return this.authService.resendRegisterOtp(dto);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.idToken);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@CurrentUser() user: { userId: string }) {
    return this.authService.logout(user.userId);
  }

  @Get('me')
  me(
    @CurrentUser()
    user: {
      userId: string;
      email: string;
      role: string;
      fullName: string;
      avatarUrl: string | null;
    },
  ) {
    return {
      id: user.userId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
    };
  }
}
