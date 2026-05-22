'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/lib/api/chat.api';
import { useAuthStore } from '@/store/auth.store';
import { useChatSocket } from '@/hooks/use-chat-socket';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageCircle, Send } from 'lucide-react';

export default function ChatPage() {
  const { user, accessToken } = useAuthStore();
  const qc = useQueryClient();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set<string>());

  const socket = useChatSocket(accessToken);
  const isInstructor = user?.role === 'instructor';

  const roomsQuery = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: () => chatApi.getRooms(),
    enabled: !!user,
  });

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', selectedRoomId],
    queryFn: () => chatApi.getMessages(selectedRoomId!),
    enabled: !!selectedRoomId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage(selectedRoomId!, content),
    onSuccess: () => {
      setMessageInput('');
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
    },
  });

  useEffect(() => {
    if (selectedRoomId && socket.isConnected) {
      socket.joinRoom(selectedRoomId);
    }
  }, [selectedRoomId, socket.isConnected]);

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data);
    }
  }, [messagesQuery.data]);

  useEffect(() => {
    const unsubNewMessage = socket.onNewMessage((msg) => {
      if (msg.roomId === selectedRoomId) {
        setMessages((prev) => [...prev, msg]);
        socket.markRead(selectedRoomId);
      }
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
      qc.invalidateQueries({ queryKey: ['chat-rooms-unread'] });
    });

    const unsubUserOnline = socket.onUserOnline((data) => {
      setOnlineUsers((prev) => new Set([...prev, data.userId]));
    });

    const unsubUserOffline = socket.onUserOffline((data) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
    });

    return () => {
      unsubNewMessage?.();
      unsubUserOnline?.();
      unsubUserOffline?.();
    };
  }, [selectedRoomId, socket, qc]);

  const handleSendMessage = () => {
    if (messageInput.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(messageInput);
      socket.sendMessage(selectedRoomId!, messageInput);
    }
  };

  if (roomsQuery.isLoading) return <LoadingSpinner />;

  const rooms = (roomsQuery.data || []) as any[];
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const getOtherParty = (room: any) =>
    isInstructor ? room.student : room.instructor;
  const getOtherPartyId = (room: any) =>
    isInstructor ? room.studentId : room.instructorId;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-canvas">
      {/* Room List */}
      <div className="w-80 bg-surface-card border-r border-hairline overflow-y-auto">
        <div className="p-4 border-b border-hairline">
          <h1 className="text-lg font-display font-semibold text-ink">
            {isInstructor ? 'Cuộc trò chuyện' : 'Chat'}
          </h1>
        </div>
        <div className="space-y-2 p-2">
          {rooms.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>
                {isInstructor
                  ? 'Chưa có cuộc trò chuyện nào'
                  : 'Chưa có đoạn chat nào'}
              </p>
            </div>
          ) : (
            rooms.map((room) => {
              const other = getOtherParty(room);
              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRoomId === room.id
                      ? 'bg-surface-strong'
                      : 'hover:bg-surface-strong'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-ink">{other.fullName}</p>
                      <p className="text-sm text-muted line-clamp-1">{room.course.title}</p>
                    </div>
                    {room.unreadCount > 0 && (
                      <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0 ml-2">
                        {room.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat View */}
      {selectedRoom ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 bg-surface-card border-b border-hairline flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <p className="font-medium text-ink">{getOtherParty(selectedRoom).fullName}</p>
                <p className="text-sm text-muted">{selectedRoom.course.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onlineUsers.has(getOtherPartyId(selectedRoom)) ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  Offline
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-canvas">
            {messagesQuery.isLoading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingSpinner />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted">
                <p>Không có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const senderId = msg.sender?.id ?? msg.senderId;
                const isOwn = senderId === user?.id;
                return (
                  <div
                    key={msg.messageId || msg._id || idx}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        isOwn
                          ? 'bg-blue-500 text-white'
                          : 'bg-surface-strong text-ink'
                      }`}
                    >
                      <p className="wrap-break-word">{msg.content}</p>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-muted'}`}>
                        {new Date(msg.sentAt || msg.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-surface-card border-t border-hairline flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Nhập tin nhắn..."
              className="flex-1 px-3 py-2 rounded-lg border border-hairline bg-canvas text-ink placeholder-muted focus:outline-none focus:border-blue-500"
              disabled={sendMessageMutation.isPending}
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || sendMessageMutation.isPending}
              className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-canvas text-muted">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>
              {isInstructor
                ? 'Chọn một cuộc trò chuyện để xem chi tiết'
                : 'Chọn một cuộc trò chuyện để bắt đầu'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
