import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('rooms')
  async createRoom(
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: CreateRoomDto,
  ) {
    if (user.role !== 'student' && user.role !== 'instructor') {
      throw new BadRequestException('Only students and instructors can create chat rooms');
    }

    if (user.role === 'student') {
      return this.chatService.createOrGetRoom(
        user.userId,
        dto.instructorId,
        dto.courseId,
      );
    } else {
      throw new BadRequestException(
        'Instructors cannot initiate rooms. Rooms are created by students.',
      );
    }
  }

  @Get('rooms')
  async getRooms(@CurrentUser() user: { userId: string; role: string }) {
    if (user.role === 'student') {
      return this.chatService.getRoomsForUser(user.userId, 'student');
    } else if (user.role === 'instructor') {
      return this.chatService.getRoomsForUser(user.userId, 'instructor');
    } else {
      throw new BadRequestException('Only students and instructors can view rooms');
    }
  }

  @Get('rooms/:id/messages')
  async getMessages(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') roomId: string,
    @Query() dto: GetMessagesDto,
  ) {
    return this.chatService.getMessages(roomId, user.userId, dto);
  }

  @Post('rooms/:id/messages')
  async sendMessage(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') roomId: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.chatService.sendMessage(
      roomId,
      user.userId,
      user.userId, // In REST, we use userId as senderName, gateway will override with actual name
      dto,
    );
    return {
      messageId: message._id.toString(),
      roomId,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      sentAt: message.createdAt,
    };
  }
}
