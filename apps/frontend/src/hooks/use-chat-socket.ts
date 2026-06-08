'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, ChatReaction } from '@/lib/api/chat.api';

interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

interface ReadEvent {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
}

interface ReactionEvent {
  messageId: string;
  reactions: ChatReaction[];
}

type Handler<T> = (data: T) => void;

interface Callbacks {
  onNewMessage: Handler<ChatMessage>[];
  onMessageAck: Handler<{ messageId: string; sentAt: string }>[];
  onMessageEdited: Handler<ChatMessage>[];
  onMessageDeleted: Handler<ChatMessage>[];
  onReactionUpdated: Handler<ReactionEvent>[];
  onUserTyping: Handler<TypingEvent>[];
  onUserOnline: Handler<{ userId: string }>[];
  onUserOffline: Handler<{ userId: string }>[];
  onMessageRead: Handler<ReadEvent>[];
}

export interface UseChatSocketReturn {
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string, messageType?: string) => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  markRead: (conversationId: string) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  react: (messageId: string, emoji: string, action: 'add' | 'remove') => void;
  onNewMessage: (cb: Handler<ChatMessage>) => () => void;
  onMessageAck: (cb: Handler<{ messageId: string; sentAt: string }>) => () => void;
  onMessageEdited: (cb: Handler<ChatMessage>) => () => void;
  onMessageDeleted: (cb: Handler<ChatMessage>) => () => void;
  onReactionUpdated: (cb: Handler<ReactionEvent>) => () => void;
  onUserTyping: (cb: Handler<TypingEvent>) => () => void;
  onUserOnline: (cb: Handler<{ userId: string }>) => () => void;
  onUserOffline: (cb: Handler<{ userId: string }>) => () => void;
  onMessageRead: (cb: Handler<ReadEvent>) => () => void;
}

export function useChatSocket(accessToken: string | null): UseChatSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbacksRef = useRef<Callbacks>({
    onNewMessage: [],
    onMessageAck: [],
    onMessageEdited: [],
    onMessageDeleted: [],
    onReactionUpdated: [],
    onUserTyping: [],
    onUserOnline: [],
    onUserOffline: [],
    onMessageRead: [],
  });

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat`,
      {
        auth: { token: accessToken },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      },
    );

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    const cb = callbacksRef.current;
    socket.on('new_message', (m) => cb.onNewMessage.forEach((f) => f(m)));
    socket.on('message_ack', (m) => cb.onMessageAck.forEach((f) => f(m)));
    socket.on('message_edited', (m) => cb.onMessageEdited.forEach((f) => f(m)));
    socket.on('message_deleted', (m) => cb.onMessageDeleted.forEach((f) => f(m)));
    socket.on('reaction_updated', (m) => cb.onReactionUpdated.forEach((f) => f(m)));
    socket.on('user_typing', (m) => cb.onUserTyping.forEach((f) => f(m)));
    socket.on('user_online', (m) => cb.onUserOnline.forEach((f) => f(m)));
    socket.on('user_offline', (m) => cb.onUserOffline.forEach((f) => f(m)));
    socket.on('message_read', (m) => cb.onMessageRead.forEach((f) => f(m)));

    socketRef.current = socket;

    const heartbeat = setInterval(() => {
      if (socket.connected) socket.emit('heartbeat');
    }, 20000);

    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
    };
  }, [accessToken]);

  const emit = useCallback((event: string, payload: unknown) => {
    if (socketRef.current?.connected) socketRef.current.emit(event, payload);
  }, []);

  const joinConversation = useCallback(
    (conversationId: string) => emit('join_conversation', { conversationId }),
    [emit],
  );
  const sendMessage = useCallback(
    (conversationId: string, content: string, messageType = 'text') =>
      emit('send_message', { conversationId, content, messageType }),
    [emit],
  );
  const sendTyping = useCallback(
    (conversationId: string, isTyping: boolean) =>
      emit('typing', { conversationId, isTyping }),
    [emit],
  );
  const markRead = useCallback(
    (conversationId: string) => emit('mark_read', { conversationId }),
    [emit],
  );
  const editMessage = useCallback(
    (messageId: string, content: string) =>
      emit('edit_message', { messageId, content }),
    [emit],
  );
  const deleteMessage = useCallback(
    (messageId: string) => emit('delete_message', { messageId }),
    [emit],
  );
  const react = useCallback(
    (messageId: string, emoji: string, action: 'add' | 'remove') =>
      emit('react', { messageId, emoji, action }),
    [emit],
  );

  // Generic subscribe helper
  const subscribe = useCallback(
    <K extends keyof Callbacks>(key: K) =>
      (cb: Callbacks[K][number]): (() => void) => {
        (callbacksRef.current[key] as Callbacks[K][number][]).push(cb);
        return () => {
          callbacksRef.current[key] = (
            callbacksRef.current[key] as Callbacks[K][number][]
          ).filter((f) => f !== cb) as Callbacks[K];
        };
      },
    [],
  );

  const onNewMessage = useCallback(subscribe('onNewMessage'), [subscribe]);
  const onMessageAck = useCallback(subscribe('onMessageAck'), [subscribe]);
  const onMessageEdited = useCallback(subscribe('onMessageEdited'), [subscribe]);
  const onMessageDeleted = useCallback(subscribe('onMessageDeleted'), [subscribe]);
  const onReactionUpdated = useCallback(subscribe('onReactionUpdated'), [subscribe]);
  const onUserTyping = useCallback(subscribe('onUserTyping'), [subscribe]);
  const onUserOnline = useCallback(subscribe('onUserOnline'), [subscribe]);
  const onUserOffline = useCallback(subscribe('onUserOffline'), [subscribe]);
  const onMessageRead = useCallback(subscribe('onMessageRead'), [subscribe]);

  return {
    isConnected,
    joinConversation,
    sendMessage,
    sendTyping,
    markRead,
    editMessage,
    deleteMessage,
    react,
    onNewMessage,
    onMessageAck,
    onMessageEdited,
    onMessageDeleted,
    onReactionUpdated,
    onUserTyping,
    onUserOnline,
    onUserOffline,
    onMessageRead,
  };
}
