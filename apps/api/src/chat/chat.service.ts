import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { Message } from './schemas/message.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    @InjectModel(Message.name) private messageModel: Model<Message>,
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

    const unreadCount = await this.messageModel.countDocuments({
      roomId: room.id,
      isRead: false,
      senderId: { $ne: studentId },
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
        const unreadCount = await this.messageModel.countDocuments({
          roomId: room.id,
          isRead: false,
          senderId: { $ne: userId },
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

    const query: any = { roomId };
    if (dto.cursor) {
      query._id = { $lt: dto.cursor };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(dto.limit)
      .lean();

    return messages.reverse();
  }

  async sendMessage(roomId: string, senderId: string, senderName: string, dto: SendMessageDto) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room || (room.studentId !== senderId && room.instructorId !== senderId)) {
      throw new ForbiddenException('Access denied to this room');
    }

    const message = await this.messageModel.create({
      roomId,
      senderId,
      senderName,
      content: dto.content,
      messageType: dto.messageType || 'text',
      isRead: false,
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

    await this.messageModel.updateMany(
      { roomId, isRead: false, senderId: { $ne: userId } },
      { isRead: true },
    );
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
