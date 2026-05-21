import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userRooms = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      client.data.name = payload.name || 'Anonymous';

      await this.chatService.setPresence(payload.sub);

      if (!this.userRooms.has(payload.sub)) {
        this.userRooms.set(payload.sub, new Set());
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.chatService.removePresence(userId);
    const rooms = this.userRooms.get(userId);
    if (rooms) {
      rooms.forEach((roomId) => {
        this.server.to(`room:${roomId}`).emit('user_offline', { userId });
      });
      this.userRooms.delete(userId);
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    client: Socket,
    payload: { roomId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const { roomId } = payload;

    const userRooms = this.userRooms.get(userId);
    if (!userRooms) return;

    userRooms.add(roomId);
    client.join(`room:${roomId}`);

    const isOnline = await this.chatService.isOnline(userId);
    if (isOnline) {
      this.server.to(`room:${roomId}`).emit('user_online', { userId });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: Socket,
    payload: { roomId: string; content: string; messageType?: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const userName = client.data.name;
    const { roomId, content, messageType = 'text' } = payload;

    try {
      const dto = new SendMessageDto();
      dto.content = content;
      dto.messageType = messageType as 'text' | 'image';

      const message = await this.chatService.sendMessage(
        roomId,
        userId,
        userName,
        dto,
      );

      const event = {
        messageId: message._id.toString(),
        roomId,
        sender: { id: userId, name: userName },
        content: message.content,
        messageType: message.messageType,
        sentAt: message.createdAt,
      };

      this.server.to(`room:${roomId}`).emit('new_message', event);
      client.emit('message_ack', {
        messageId: message._id.toString(),
        sentAt: message.createdAt,
      });
    } catch (error) {
      client.emit('message_error', { error: error.message });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    client: Socket,
    payload: { roomId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const { roomId } = payload;

    try {
      await this.chatService.markRead(roomId, userId);
    } catch (error) {
      client.emit('mark_read_error', { error: error.message });
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(client: Socket): Promise<void> {
    const userId = client.data.userId;
    if (userId) {
      await this.chatService.setPresence(userId);
    }
  }
}
