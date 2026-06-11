import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { Prisma, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Shape returned to clients for a single message (BigInt-safe, attachments + reactions included).
export type MessagePayload = ReturnType<ChatService['formatMessage']>;

const messageInclude = {
  attachments: true,
  reactions: { select: { userId: true, emoji: true } },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
  ) {}

  /** Canonical ordering so each user-pair maps to exactly one conversation row. */
  private orderPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private formatMessage(m: MessageWithRelations) {
    const isDeleted = !!m.deletedAt;
    return {
      id: m.id,
      messageId: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: isDeleted ? null : m.content,
      messageType: m.messageType,
      isDeleted,
      createdAt: m.createdAt,
      sentAt: m.createdAt,
      editedAt: m.editedAt,
      attachments: isDeleted
        ? []
        : m.attachments.map((a) => ({
            id: a.id,
            fileUrl: a.fileUrl,
            fileName: a.fileName,
            fileSize: Number(a.fileSize),
            mimeType: a.mimeType,
          })),
      reactions: m.reactions.map((r) => ({ userId: r.userId, emoji: r.emoji })),
    };
  }

  // ─── Conversations ──────────────────────────────────────────────────────────

  /**
   * Returns (creating if needed) the 1-1 conversation between the current user and
   * the target. Authorization: the two must share a student↔instructor enrollment.
   */
  async getOrCreateConversation(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    }

    const allowed = await this.haveEnrollmentRelationship(
      currentUserId,
      targetUserId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'You can only chat with an instructor of a course you are enrolled in',
      );
    }

    const [user1Id, user2Id] = this.orderPair(currentUserId, targetUserId);

    const conversation = await this.prisma.conversation.upsert({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      create: { user1Id, user2Id },
      update: {},
      include: {
        user1: { select: { id: true, fullName: true, avatarUrl: true } },
        user2: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    return this.shapeConversation(conversation, currentUserId, 0, null);
  }

  /** True if one user is a student enrolled in a course taught by the other. */
  private async haveEnrollmentRelationship(
    a: string,
    b: string,
  ): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        OR: [
          { studentId: a, course: { instructorId: b } },
          { studentId: b, course: { instructorId: a } },
        ],
      },
      select: { id: true },
    });
    return !!enrollment;
  }

  async getConversationsForUser(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { select: { id: true, fullName: true, avatarUrl: true } },
        user2: { select: { id: true, fullName: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      conversations.map(async (c) => {
        const unreadCount = await this.countUnread(c.id, userId);
        const last = c.messages[0];
        const lastMessage = last
          ? {
              id: last.id,
              content: last.deletedAt ? null : last.content,
              messageType: last.messageType,
              isDeleted: !!last.deletedAt,
              senderId: last.senderId,
              createdAt: last.createdAt,
            }
          : null;
        return this.shapeConversation(c, userId, unreadCount, lastMessage);
      }),
    );
  }

  private shapeConversation(
    c: {
      id: string;
      user1Id: string;
      user2Id: string;
      createdAt: Date;
      updatedAt: Date;
      user1: { id: string; fullName: string; avatarUrl: string | null };
      user2: { id: string; fullName: string; avatarUrl: string | null };
    },
    userId: string,
    unreadCount: number,
    lastMessage: unknown,
  ) {
    const other = c.user1.id === userId ? c.user2 : c.user1;
    return {
      id: c.id,
      otherUser: other,
      otherUserId: other.id,
      unreadCount,
      lastMessage,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /** Throws unless the user is one of the two participants. Returns participant ids. */
  async assertParticipant(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { user1Id: true, user2Id: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.user1Id !== userId && conv.user2Id !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }
    return conv;
  }

  async getParticipants(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { user1Id: true, user2Id: true },
    });
  }

  // ─── Messages ────────────────────────────────────────────────────────────────

  async getMessages(
    conversationId: string,
    userId: string,
    opts: { cursor?: string; limit: number },
  ) {
    await this.assertParticipant(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
    });

    return messages.reverse().map((m) => this.formatMessage(m));
  }

  async createMessage(
    conversationId: string,
    senderId: string,
    data: {
      content?: string | null;
      messageType?: MessageType;
      attachments?: {
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
      }[];
    },
  ): Promise<MessagePayload> {
    await this.assertParticipant(conversationId, senderId);

    const hasAttachments = !!data.attachments?.length;
    if (!data.content?.trim() && !hasAttachments) {
      throw new BadRequestException(
        'Message must have content or an attachment',
      );
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: data.content ?? null,
        messageType: data.messageType ?? MessageType.text,
        ...(hasAttachments
          ? {
              attachments: {
                create: data.attachments!.map((a) => ({
                  fileUrl: a.fileUrl,
                  fileName: a.fileName,
                  fileSize: BigInt(a.fileSize),
                  mimeType: a.mimeType,
                })),
              },
            }
          : {}),
      },
      include: messageInclude,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return this.formatMessage(message);
  }

  async editMessage(
    messageId: string,
    userId: string,
    content: string,
  ): Promise<MessagePayload> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, deletedAt: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    if (message.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: messageInclude,
    });
    return this.formatMessage(updated);
  }

  async deleteMessage(
    messageId: string,
    userId: string,
  ): Promise<MessagePayload> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: messageInclude,
    });
    return this.formatMessage(updated);
  }

  /** Returns the conversationId of a message (for routing broadcasts). */
  async getMessageConversationId(messageId: string): Promise<string | null> {
    const m = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return m?.conversationId ?? null;
  }

  // ─── Read status ─────────────────────────────────────────────────────────────

  /** Marks the conversation read up to its latest message for this user. */
  async markRead(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);

    const latest = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return null;

    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, lastReadMessageId: latest.id },
      update: { lastReadMessageId: latest.id },
    });

    return { conversationId, userId, lastReadMessageId: latest.id };
  }

  private async countUnread(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    const read = await this.prisma.conversationRead.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { lastReadMessage: { select: { createdAt: true } } },
    });
    const lastReadAt = read?.lastReadMessage?.createdAt;

    return this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  // ─── Reactions ───────────────────────────────────────────────────────────────

  /** Toggle-safe add/remove; returns the message's full reaction list. */
  async setReaction(
    messageId: string,
    userId: string,
    emoji: string,
    action: 'add' | 'remove',
  ) {
    const conversationId = await this.getMessageConversationId(messageId);
    if (!conversationId) throw new NotFoundException('Message not found');
    await this.assertParticipant(conversationId, userId);

    if (action === 'add') {
      await this.prisma.messageReaction.upsert({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
        create: { messageId, userId, emoji },
        update: {},
      });
    } else {
      await this.prisma.messageReaction
        .delete({
          where: { messageId_userId_emoji: { messageId, userId, emoji } },
        })
        .catch(() => undefined);
    }

    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      select: { userId: true, emoji: true },
    });
    return { conversationId, messageId, reactions };
  }

  // ─── Presence (Redis) ────────────────────────────────────────────────────────

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
