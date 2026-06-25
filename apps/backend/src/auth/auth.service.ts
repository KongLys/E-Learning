import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { ResendRegisterOtpDto } from './dto/resend-register-otp.dto';

const MAX_OTP_ATTEMPTS = 5;

interface PendingRegistration {
  code: string;
  passwordHash: string;
  fullName: string;
  role: 'student' | 'instructor';
  attempts: number;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
    @InjectRedis() private redis: Redis,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID', ''),
    );
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
      },
    });

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  /**
   * Bước 1 đăng ký: kiểm tra email, hash mật khẩu, sinh OTP, lưu tạm vào Redis
   * (CHƯA tạo user trong DB), gửi mã về email.
   */
  async requestRegisterOtp(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const code = this.generateOtpCode();
    const ttl = this.getOtpTtl();
    const pending: PendingRegistration = {
      code,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      attempts: 0,
    };

    // setex ghi đè key cũ nếu user gọi lại request-otp cho email đang chờ.
    await this.redis.setex(this.otpKey(email), ttl, JSON.stringify(pending));

    try {
      await this.mail.sendOtpEmail(email, code, ttl);
    } catch {
      // Gửi mail lỗi -> xoá phiên để user có thể thử lại sạch sẽ.
      await this.redis.del(this.otpKey(email));
      throw new ServiceUnavailableException(
        'Không gửi được email xác minh, vui lòng thử lại sau.',
      );
    }

    return { message: 'Mã xác minh đã được gửi tới email của bạn.' };
  }

  /**
   * Bước 2 đăng ký: đối chiếu OTP trong Redis; nếu đúng mới tạo user trong DB.
   */
  async verifyRegisterOtp(dto: VerifyRegisterOtpDto) {
    const email = dto.email.toLowerCase();
    const key = this.otpKey(email);
    const raw = await this.redis.get(key);
    if (!raw)
      throw new BadRequestException(
        'Mã đã hết hạn hoặc không tồn tại, vui lòng gửi lại.',
      );

    const pending = JSON.parse(raw) as PendingRegistration;

    if (pending.code !== dto.code) {
      const attempts = (pending.attempts ?? 0) + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.redis.del(key);
        throw new BadRequestException(
          'Bạn đã nhập sai mã quá số lần cho phép, vui lòng gửi lại mã.',
        );
      }
      // Giữ nguyên thời hạn còn lại của key khi cập nhật số lần thử.
      const remaining = await this.redis.ttl(key);
      await this.redis.setex(
        key,
        remaining > 0 ? remaining : this.getOtpTtl(),
        JSON.stringify({ ...pending, attempts }),
      );
      throw new BadRequestException('Mã xác minh không đúng.');
    }

    // Đúng mã: "chiếm" phiên (atomic) trước khi tạo user để chống double-submit.
    await this.redis.del(key);

    let user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
      avatarUrl: string | null;
    };
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: pending.passwordHash,
          fullName: pending.fullName,
          role: pending.role,
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Email đã được đăng ký, vui lòng đăng nhập.');
      }
      throw err;
    }

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  /**
   * Gửi lại OTP cho một email đang có phiên đăng ký chờ trong Redis.
   */
  async resendRegisterOtp(dto: ResendRegisterOtpDto) {
    const email = dto.email.toLowerCase();
    const key = this.otpKey(email);
    const raw = await this.redis.get(key);
    if (!raw)
      throw new BadRequestException(
        'Không có yêu cầu đăng ký đang chờ, vui lòng đăng ký lại.',
      );

    const pending = JSON.parse(raw) as PendingRegistration;
    const code = this.generateOtpCode();
    const ttl = this.getOtpTtl();
    await this.redis.setex(
      key,
      ttl,
      JSON.stringify({ ...pending, code, attempts: 0 }),
    );

    try {
      await this.mail.sendOtpEmail(email, code, ttl);
    } catch {
      throw new ServiceUnavailableException(
        'Không gửi được email xác minh, vui lòng thử lại sau.',
      );
    }

    return { message: 'Mã xác minh mới đã được gửi.' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== 'active')
      throw new UnauthorizedException('Account is not active');

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  /**
   * Đăng nhập bằng Google: xác minh ID token (Google Identity Services) ở backend,
   * tìm user theo email — nếu có thì đăng nhập (tự liên kết), chưa có thì tạo mới.
   */
  async googleLogin(idToken: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');
    if (!clientId)
      throw new ServiceUnavailableException(
        'Đăng nhập Google chưa được cấu hình.',
      );

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google token không hợp lệ.');
    }

    if (!payload?.email || !payload.email_verified)
      throw new UnauthorizedException('Email Google chưa được xác minh.');

    const email = payload.email.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.status !== 'active')
        throw new UnauthorizedException('Account is not active');
    } else {
      // Tài khoản tạo qua Google không dùng mật khẩu -> hash ngẫu nhiên không thể đăng nhập bằng mật khẩu.
      const passwordHash = await bcrypt.hash(randomUUID(), 12);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName: payload.name || email.split('@')[0],
          avatarUrl: payload.picture ?? null,
          role: 'student',
        },
      });
    }

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET', 'secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Redis check temporarily disabled
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== 'active') throw new UnauthorizedException();

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  async logout(userId: string) {
    // Redis cleanup temporarily disabled
    return { message: 'Logged out' };
  }

  private otpKey(email: string) {
    return `register_otp:${email}`;
  }

  private generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private getOtpTtl(): number {
    return Number(this.config.get('OTP_TTL_SECONDS', 600));
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
  }) {
    const jti = randomUUID();
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: this.config.get('JWT_ACCESS_EXPIRES', '15m') },
    );

    const refreshExpires = this.config.get('JWT_REFRESH_EXPIRES', '7d');
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { expiresIn: refreshExpires },
    );

    // Redis storage temporarily disabled
    // await this.redis.setex(`refresh_token:${user.id}:${jti}`, ttlSeconds, 'valid');

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
    };
  }
}
