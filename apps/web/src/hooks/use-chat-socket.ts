'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  messageId: string;
  roomId: string;
  sender: { id: string; name: string };
  content: string;
  messageType: string;
  sentAt: string;
}

interface UseChatSocketReturn {
  joinRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string, messageType?: string) => void;
  markRead: (roomId: string) => void;
  onNewMessage: (callback: (msg: ChatMessage) => void) => () => void;
  onMessageAck: (callback: (ack: { messageId: string; sentAt: string }) => void) => () => void;
  onUserOnline: (callback: (data: { userId: string }) => void) => () => void;
  onUserOffline: (callback: (data: { userId: string }) => void) => () => void;
  isConnected: boolean;
}

export function useChatSocket(accessToken: string | null): UseChatSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbacksRef = useRef<{
    onNewMessage: ((msg: ChatMessage) => void)[];
    onMessageAck: ((ack: any) => void)[];
    onUserOnline: ((data: any) => void)[];
    onUserOffline: ((data: any) => void)[];
  }>({
    onNewMessage: [],
    onMessageAck: [],
    onUserOnline: [],
    onUserOffline: [],
  });

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat`, {
      auth: { token: accessToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Chat connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Chat disconnected');
    });

    socket.on('new_message', (msg: ChatMessage) => {
      callbacksRef.current.onNewMessage.forEach((cb) => cb(msg));
    });

    socket.on('message_ack', (ack) => {
      callbacksRef.current.onMessageAck.forEach((cb) => cb(ack));
    });

    socket.on('user_online', (data) => {
      callbacksRef.current.onUserOnline.forEach((cb) => cb(data));
    });

    socket.on('user_offline', (data) => {
      callbacksRef.current.onUserOffline.forEach((cb) => cb(data));
    });

    socketRef.current = socket;

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat');
      }
    }, 20000);

    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
    };
  }, [accessToken]);

  const joinRoom = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join_room', { roomId });
    }
  }, []);

  const sendMessage = useCallback((roomId: string, content: string, messageType = 'text') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('send_message', { roomId, content, messageType });
    }
  }, []);

  const markRead = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('mark_read', { roomId });
    }
  }, []);

  const onNewMessage = useCallback(
    (callback: (msg: ChatMessage) => void): (() => void) => {
      callbacksRef.current.onNewMessage.push(callback);
      return () => {
        callbacksRef.current.onNewMessage = callbacksRef.current.onNewMessage.filter(
          (cb) => cb !== callback,
        );
      };
    },
    [],
  );

  const onMessageAck = useCallback(
    (callback: (ack: any) => void): (() => void) => {
      callbacksRef.current.onMessageAck.push(callback);
      return () => {
        callbacksRef.current.onMessageAck = callbacksRef.current.onMessageAck.filter(
          (cb) => cb !== callback,
        );
      };
    },
    [],
  );

  const onUserOnline = useCallback(
    (callback: (data: any) => void): (() => void) => {
      callbacksRef.current.onUserOnline.push(callback);
      return () => {
        callbacksRef.current.onUserOnline = callbacksRef.current.onUserOnline.filter(
          (cb) => cb !== callback,
        );
      };
    },
    [],
  );

  const onUserOffline = useCallback(
    (callback: (data: any) => void): (() => void) => {
      callbacksRef.current.onUserOffline.push(callback);
      return () => {
        callbacksRef.current.onUserOffline = callbacksRef.current.onUserOffline.filter(
          (cb) => cb !== callback,
        );
      };
    },
    [],
  );

  return {
    joinRoom,
    sendMessage,
    markRead,
    onNewMessage,
    onMessageAck,
    onUserOnline,
    onUserOffline,
    isConnected,
  };
}
