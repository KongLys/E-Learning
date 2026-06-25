import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};
const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
};
const mockJwt = { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue('15m') };
const mockMail = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('token');
    mockConfig.get.mockReturnValue('15m');
    mockRedis.setex.mockResolvedValue('OK');
  });

  describe('register', () => {
    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
      });
      await expect(
        service.register({
          email: 'test@test.com',
          password: 'Test@123',
          fullName: 'Test',
          role: 'student',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: '1',
        email: 'new@test.com',
        fullName: 'New',
        role: 'student',
        avatarUrl: null,
      });
      const result = await service.register({
        email: 'new@test.com',
        password: 'Test@123',
        fullName: 'New',
        role: 'student',
      });
      expect(result.user.email).toBe('new@test.com');
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: await bcrypt.hash('Correct@1', 12),
        status: 'active',
      });
      await expect(
        service.login({ email: 'test@test.com', password: 'Wrong@1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for locked user', async () => {
      const hash = await bcrypt.hash('Test@123', 12);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash: hash,
        status: 'locked',
      });
      await expect(
        service.login({ email: 'test@test.com', password: 'Test@123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException if token not in Redis', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-1' });
      mockRedis.get.mockResolvedValue(null);
      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
