import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
  ) {}

  async createOrGetRoom(studentId: string, instructorId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId },
      },
      select: { id: true },
    });

    if (!enrollment) {
      throw new BadRequestException('Student not enrolled in this course');
    }

    const room = await this.prisma.chatRoom.upsert({
      where: {
        studentId_instructorId_courseId: { studentId, instructorId, courseId },
      },
      create: { studentId, instructorId, courseId },
      update: { updatedAt: new Date() },
      include: {
        student: { select: { id: true, fullName: true } },
        instructor: { select: { id: true, fullName: true } },
        course: { select: { id: true, title: true } },
      },
    });

    const unreadCount = await this.prisma.message.count({
      where: {
        roomId: room.id,
        isRead: false,
        senderId: { not: studentId },
      },
    });

    return { ...room, unreadCount };
  }

  async getRoomsForUser(userId: string, role: 'student' | 'instructor') {
    const rooms = await this.prisma.chatRoom.findMany({
      where:
        role === 'student'
          ? { studentId: userId }
          : { instructorId: userId },
      include: {
        student: { select: { id: true, fullName: true } },
        instructor: { select: { id: true, fullName: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            roomId: room.id,
            isRead: false,
            senderId: { not: userId },
          },
        });
        return { ...room, unreadCount };
      }),
    );

    return roomsWithUnread;
  }

  async getMessages(roomId: string, userId: string, dto: GetMessagesDto) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room || (room.studentId !== userId && room.instructorId !== userId)) {
      throw new ForbiddenException('Access denied to this room');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        roomId,
        ...(dto.cursor ? { createdAt: { lt: new Date(dto.cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: dto.limit,
    });

    return messages.reverse();
  }

  async sendMessage(roomId: string, senderId: string, senderName: string, dto: SendMessageDto) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room || (room.studentId !== senderId && room.instructorId !== senderId)) {
      throw new ForbiddenException('Access denied to this room');
    }

    const message = await this.prisma.message.create({
      data: {
        roomId,
        senderId,
        senderName,
        content: dto.content,
        messageType: dto.messageType || 'text',
      },
    });

    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async markRead(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room || (room.studentId !== userId && room.instructorId !== userId)) {
      throw new ForbiddenException('Access denied to this room');
    }

    await this.prisma.message.updateMany({
      where: {
        roomId,
        isRead: false,
        senderId: { not: userId },
      },
      data: { isRead: true },
    });
  }

  async setPresence(userId: string) {
    await this.redis.setex(`presence:${userId}`, 30, '1');
  }

  async removePresence(userId: string) {
    await this.redis.del(`presence:${userId}`);
  }

  async isOnline(userId: string): Promise<boolean> {
    const exists = await this.redis.exists(`presence:${userId}`);
    return exists === 1;
  }
}
