import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  course: { count: jest.fn() },
};
const mockStorage = { uploadFile: jest.fn(), deleteFile: jest.fn(), extractKeyFromUrl: jest.fn() };

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  describe('changePassword', () => {
    it('throws UnauthorizedException for wrong current password', async () => {
      const hash = await bcrypt.hash('Correct@1', 12);
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: hash });
      await expect(
        service.changePassword('1', { currentPassword: 'Wrong@1', newPassword: 'New@123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException if new password equals current', async () => {
      const hash = await bcrypt.hash('Same@123', 12);
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: hash });
      await expect(
        service.changePassword('1', { currentPassword: 'Same@123', newPassword: 'Same@123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateUserStatus', () => {
    it('throws ForbiddenException when admin locks themselves', async () => {
      await expect(
        service.updateUserStatus('admin-1', 'admin-1', { status: 'locked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('uploadAvatar', () => {
    it('throws BadRequestException for disallowed mimetype', async () => {
      const fakeFile = { mimetype: 'application/pdf', size: 100, buffer: Buffer.from('') } as Express.Multer.File;
      await expect(service.uploadAvatar('user-1', fakeFile)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for oversized file', async () => {
      const fakeFile = { mimetype: 'image/jpeg', size: 6 * 1024 * 1024, buffer: Buffer.from('') } as Express.Multer.File;
      await expect(service.uploadAvatar('user-1', fakeFile)).rejects.toThrow(BadRequestException);
    });
  });
});
