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
import { MessageType } from '@prisma/client';
import { ChatService, MessagePayload } from './chat.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // userId -> set of conversationIds the user has joined (for offline broadcast)
  private userConversations = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
  ) {}

  private room(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

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
      await this.chatService.setPresence(payload.sub);

      if (!this.userConversations.has(payload.sub)) {
        this.userConversations.set(payload.sub, new Set());
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.chatService.removePresence(userId);
    const conversations = this.userConversations.get(userId);
    if (conversations) {
      conversations.forEach((conversationId) => {
        this.server
          .to(this.room(conversationId))
          .emit('user_offline', { userId });
      });
      this.userConversations.delete(userId);
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    client: Socket,
    payload: { conversationId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const { conversationId } = payload;
    if (!userId || !conversationId) return;

    let participants;
    try {
      participants = await this.chatService.assertParticipant(
        conversationId,
        userId,
      );
    } catch {
      return; // not a participant — ignore silently
    }

    this.userConversations.get(userId)?.add(conversationId);
    client.join(this.room(conversationId));

    // Announce my presence to the other party already in the room.
    client.to(this.room(conversationId)).emit('user_online', { userId });

    // Sync back the other participant's current presence (fixes asymmetric join).
    const otherId =
      participants.user1Id === userId
        ? participants.user2Id
        : participants.user1Id;
    if (await this.chatService.isOnline(otherId)) {
      client.emit('user_online', { userId: otherId });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: Socket,
    payload: { conversationId: string; content: string; messageType?: string },
  ): Promise<void> {
    const userId = client.data.userId;
    const { conversationId, content, messageType } = payload;

    try {
      const message = await this.chatService.createMessage(
        conversationId,
        userId,
        {
          content,
          messageType: (messageType as MessageType) ?? MessageType.text,
        },
      );

      this.broadcastMessage(conversationId, message);
      client.emit('message_ack', {
        messageId: message.id,
        sentAt: message.createdAt,
      });
    } catch (error) {
      client.emit('message_error', { error: error.message });
    }
  }

  /** Public: also used by the REST upload endpoint to broadcast attachment messages. */
  broadcastMessage(conversationId: string, message: MessagePayload): void {
    this.server.to(this.room(conversationId)).emit('new_message', message);
  }

  @SubscribeMessage('typing')
  handleTyping(
    client: Socket,
    payload: { conversationId: string; isTyping: boolean },
  ): void {
    const userId = client.data.userId;
    if (!userId) return;
    const { conversationId, isTyping } = payload;
    client.to(this.room(conversationId)).emit('user_typing', {
      conversationId,
      userId,
      isTyping,
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    client: Socket,
    payload: { conversationId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    try {
      const result = await this.chatService.markRead(
        payload.conversationId,
        userId,
      );
      if (result) {
        // Notify the other party that we've read up to this message.
        client.to(this.room(payload.conversationId)).emit('message_read', result);
      }
    } catch (error) {
      client.emit('mark_read_error', { error: error.message });
    }
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    client: Socket,
    payload: { messageId: string; content: string },
  ): Promise<void> {
    const userId = client.data.userId;
    try {
      const message = await this.chatService.editMessage(
        payload.messageId,
        userId,
        payload.content,
      );
      this.server
        .to(this.room(message.conversationId))
        .emit('message_edited', message);
    } catch (error) {
      client.emit('message_error', { error: error.message });
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    client: Socket,
    payload: { messageId: string },
  ): Promise<void> {
    const userId = client.data.userId;
    try {
      const message = await this.chatService.deleteMessage(
        payload.messageId,
        userId,
      );
      this.server
        .to(this.room(message.conversationId))
        .emit('message_deleted', message);
    } catch (error) {
      client.emit('message_error', { error: error.message });
    }
  }

  @SubscribeMessage('react')
  async handleReact(
    client: Socket,
    payload: { messageId: string; emoji: string; action: 'add' | 'remove' },
  ): Promise<void> {
    const userId = client.data.userId;
    try {
      const result = await this.chatService.setReaction(
        payload.messageId,
        userId,
        payload.emoji,
        payload.action,
      );
      this.server
        .to(this.room(result.conversationId))
        .emit('reaction_updated', {
          messageId: result.messageId,
          reactions: result.reactions,
        });
    } catch (error) {
      client.emit('message_error', { error: error.message });
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
