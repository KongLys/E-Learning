import { apiClient } from './axios';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video';

export interface ChatAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface ChatReaction {
  userId: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  messageType: MessageType;
  isDeleted: boolean;
  createdAt: string;
  sentAt: string;
  editedAt: string | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
}

export interface ChatUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface Conversation {
  id: string;
  otherUser: ChatUser;
  otherUserId: string;
  unreadCount: number;
  lastMessage: {
    id: string;
    content: string | null;
    messageType: MessageType;
    isDeleted: boolean;
    senderId: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const chatApi = {
  getConversations: (): Promise<Conversation[]> =>
    apiClient.get('/chat/conversations').then((res) => res.data),

  createConversation: (targetUserId: string): Promise<Conversation> =>
    apiClient
      .post('/chat/conversations', { targetUserId })
      .then((res) => res.data),

  getMessages: (
    conversationId: string,
    cursor?: string,
    limit = 30,
  ): Promise<ChatMessage[]> =>
    apiClient
      .get(`/chat/conversations/${conversationId}/messages`, {
        params: { cursor, limit },
      })
      .then((res) => res.data),

  uploadAttachment: (
    conversationId: string,
    file: File,
    content?: string,
    onProgress?: (pct: number) => void,
  ): Promise<ChatMessage> => {
    const fd = new FormData();
    fd.append('file', file);
    if (content) fd.append('content', content);
    return apiClient
      .post(`/chat/conversations/${conversationId}/messages/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((res) => res.data);
  },
};
