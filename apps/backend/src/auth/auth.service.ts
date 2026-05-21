import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @InjectRedis() private redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
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

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== 'active') throw new UnauthorizedException('Account is not active');

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
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') throw new UnauthorizedException();

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  async logout(userId: string) {
    // Redis cleanup temporarily disabled
    return { message: 'Logged out' };
  }

  private async generateTokens(user: { id: string; email: string; role: string }) {
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

  private sanitizeUser(user: { id: string; email: string; fullName: string; role: string; avatarUrl: string | null }) {
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, avatarUrl: user.avatarUrl };
  }
}
