import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async getPublicProfile(targetId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!user) throw new NotFoundException('User not found');
    const courseCount = await this.prisma.course.count({
      where: { instructorId: targetId, status: 'published' },
    });
    return {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      publishedCourses: courseCount,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return this.sanitize(user);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP images are allowed');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File size must not exceed 5MB');
    }

    const resized = await sharp(file.buffer).resize(400, 400, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();

    const ext = 'jpg';
    const key = `avatars/${userId}/${randomUUID()}.${ext}`;

    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (existing?.avatarUrl) {
      const oldKey = this.storage.extractKeyFromUrl(existing.avatarUrl);
      await this.storage.deleteFile(oldKey);
    }

    const url = await this.storage.uploadFile(key, resized, 'image/jpeg');
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return { message: 'Password changed successfully' };
  }

  async listUsers(query: { page?: number; limit?: number; role?: string; status?: string; search?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async updateUserStatus(adminId: string, targetId: string, dto: UpdateUserStatusDto) {
    if (adminId === targetId) throw new ForbiddenException('Cannot change your own status');
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { status: dto.status },
    });
    return this.sanitize(user);
  }

  private sanitize(user: {
    id: string; email: string; fullName: string; avatarUrl: string | null;
    phone: string | null; role: string; status: string; bio: string | null; createdAt: Date;
  }) {
    return {
      id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl,
      phone: user.phone, role: user.role, status: user.status, bio: user.bio, createdAt: user.createdAt,
    };
  }
}
