import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { MessageType } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { StorageService } from '../storage/storage.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

function messageTypeFromMime(mime: string): MessageType {
  if (mime.startsWith('image/')) return MessageType.image;
  if (mime.startsWith('audio/')) return MessageType.audio;
  if (mime.startsWith('video/')) return MessageType.video;
  return MessageType.file;
}

@Controller('chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
    private storageService: StorageService,
  ) {}

  @Post('conversations')
  createConversation(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.getOrCreateConversation(user.userId, dto.targetUserId);
  }

  @Get('conversations')
  getConversations(@CurrentUser() user: { userId: string }) {
    return this.chatService.getConversationsForUser(user.userId);
  }

  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: { userId: string },
    @Param('id') conversationId: string,
    @Query() dto: GetMessagesDto,
  ) {
    return this.chatService.getMessages(conversationId, user.userId, {
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }

  @Post('conversations/:id/messages/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { content?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const key = `chat/${conversationId}/${randomUUID()}-${file.originalname}`;
    const fileUrl = await this.storageService.uploadFile(
      key,
      file.buffer,
      file.mimetype,
    );

    const message = await this.chatService.createMessage(conversationId, user.userId, {
      content: body.content,
      messageType: messageTypeFromMime(file.mimetype),
      attachments: [
        {
          fileUrl,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      ],
    });

    // Push to the other participant in realtime (REST is used only for multipart).
    this.chatGateway.broadcastMessage(conversationId, message);
    return message;
  }
}
