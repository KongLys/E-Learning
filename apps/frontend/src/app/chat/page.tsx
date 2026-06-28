'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, ChatMessage, Conversation } from '@/lib/api/chat.api';
import { useAuthStore } from '@/store/auth.store';
import { useChatSocket } from '@/hooks/use-chat-socket';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageCircle, Send, Paperclip, Smile, Pencil, Trash2, X, Check } from 'lucide-react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-sky text-white flex items-center justify-center font-medium shrink-0"
      style={{ width: size, height: size }}
    >
      {name?.charAt(0).toUpperCase() ?? '?'}
    </div>
  );
}

export default function ChatPage() {
  const { user, accessToken } = useAuthStore();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set<string>());
  const [typingUsers, setTypingUsers] = useState(new Set<string>());
  const [otherReadId, setOtherReadId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const ownTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const socket = useChatSocket(accessToken);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations(),
    enabled: !!user,
  });

  const messagesQuery = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => chatApi.getMessages(selectedId!),
    enabled: !!selectedId,
  });

  const conversations = (conversationsQuery.data || []) as Conversation[];
  const selected = conversations.find((c) => c.id === selectedId);

  // Join conversation room when selected & connected
  useEffect(() => {
    if (selectedId && socket.isConnected) socket.joinConversation(selectedId);
    // socket được tạo mới mỗi render nên cố ý không đưa vào deps (tránh re-join liên tục)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, socket.isConnected]);

  // Đồng bộ tin nhắn từ query vào state cục bộ (set-state-during-render thay useEffect)
  const [prevMessagesData, setPrevMessagesData] = useState(messagesQuery.data);
  if (messagesQuery.data && messagesQuery.data !== prevMessagesData) {
    setPrevMessagesData(messagesQuery.data);
    setMessages(messagesQuery.data);
  }

  // Đánh dấu hội thoại đã đọc khi mở
  useEffect(() => {
    if (!messagesQuery.data) return;
    if (selectedId && socket.isConnected) {
      socket.markRead(selectedId);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-rooms-unread'] });
    }
    // socket/qc ổn định theo vòng đời; cố ý chỉ chạy lại khi dữ liệu/hội thoại đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQuery.data, selectedId, socket.isConnected]);

  // Reset trạng thái tạm khi đổi hội thoại (set-state-during-render thay useEffect)
  const [prevConvId, setPrevConvId] = useState(selectedId);
  if (selectedId !== prevConvId) {
    setPrevConvId(selectedId);
    setTypingUsers(new Set());
    setOtherReadId(null);
    setEditingId(null);
    setReactionPickerFor(null);
  }

  // Dọn các timer "đang gõ" khi rời hội thoại
  useEffect(() => {
    const timers = typingClearTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); timers.clear(); };
  }, [selectedId]);

  // Auto-scroll to bottom on new messages — scroll only the message list,
  // never the window (which would drag the whole page down to the footer).
  useEffect(() => {
    const c = messagesContainerRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Đóng bộ chọn cảm xúc khi bấm ra ngoài vùng react.
  useEffect(() => {
    if (!reactionPickerFor) return;
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-reaction-ui]')) setReactionPickerFor(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reactionPickerFor]);

  // Clear timers on unmount
  useEffect(() => {
    const timers = typingClearTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (ownTypingTimer.current) clearTimeout(ownTypingTimer.current);
    };
  }, []);

  const upsertMessage = (incoming: ChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  };

  // Socket subscriptions
  useEffect(() => {
    const subs = [
      socket.onNewMessage((msg) => {
        if (msg.conversationId === selectedId) {
          upsertMessage(msg);
          socket.markRead(selectedId);
          // Sender stops typing once a message arrives
          setTypingUsers((prev) => {
            if (!prev.has(msg.senderId)) return prev;
            const n = new Set(prev);
            n.delete(msg.senderId);
            return n;
          });
        }
        qc.invalidateQueries({ queryKey: ['conversations'] });
        qc.invalidateQueries({ queryKey: ['chat-rooms-unread'] });
      }),
      socket.onMessageEdited((msg) => {
        if (msg.conversationId === selectedId) upsertMessage(msg);
      }),
      socket.onMessageDeleted((msg) => {
        if (msg.conversationId === selectedId) upsertMessage(msg);
        qc.invalidateQueries({ queryKey: ['conversations'] });
      }),
      socket.onReactionUpdated(({ messageId, reactions }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        );
      }),
      socket.onUserOnline((d) => setOnlineUsers((prev) => new Set([...prev, d.userId]))),
      socket.onUserOffline((d) =>
        setOnlineUsers((prev) => {
          const n = new Set(prev);
          n.delete(d.userId);
          return n;
        }),
      ),
      socket.onMessageRead((d) => {
        if (d.conversationId === selectedId && d.userId !== user?.id) {
          setOtherReadId(d.lastReadMessageId);
        }
      }),
      socket.onUserTyping((d) => {
        if (d.conversationId !== selectedId || d.userId === user?.id) return;
        setTypingUsers((prev) => {
          const n = new Set(prev);
          if (d.isTyping) n.add(d.userId);
          else n.delete(d.userId);
          return n;
        });
        const timers = typingClearTimers.current;
        const existing = timers.get(d.userId);
        if (existing) clearTimeout(existing);
        if (d.isTyping) {
          timers.set(
            d.userId,
            setTimeout(() => {
              setTypingUsers((prev) => {
                const n = new Set(prev);
                n.delete(d.userId);
                return n;
              });
              timers.delete(d.userId);
            }, 4000),
          );
        }
      }),
    ];
    return () => subs.forEach((u) => u());
  }, [selectedId, socket, qc, user?.id]);

  const emitStopTyping = () => {
    if (ownTypingTimer.current) {
      clearTimeout(ownTypingTimer.current);
      ownTypingTimer.current = null;
    }
    if (selectedId) socket.sendTyping(selectedId, false);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!selectedId) return;
    if (value.trim()) {
      socket.sendTyping(selectedId, true);
      if (ownTypingTimer.current) clearTimeout(ownTypingTimer.current);
      ownTypingTimer.current = setTimeout(() => {
        socket.sendTyping(selectedId, false);
        ownTypingTimer.current = null;
      }, 1500);
    } else {
      emitStopTyping();
    }
  };

  const handleSend = () => {
    if (input.trim() && selectedId && socket.isConnected) {
      socket.sendMessage(selectedId, input.trim());
      setInput('');
      emitStopTyping();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      await chatApi.uploadAttachment(selectedId, file);
      // Broadcast from server delivers the message via onNewMessage.
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEditSubmit = (messageId: string) => {
    if (editingText.trim()) socket.editMessage(messageId, editingText.trim());
    setEditingId(null);
    setEditingText('');
  };

  const toggleReaction = (msg: ChatMessage, emoji: string) => {
    const mine = msg.reactions.some((r) => r.userId === user?.id && r.emoji === emoji);
    socket.react(msg.id, emoji, mine ? 'remove' : 'add');
    setReactionPickerFor(null);
  };

  // Index of the last own message the other user has read
  const readIndex = useMemo(() => {
    if (!otherReadId) return -1;
    return messages.findIndex((m) => m.id === otherReadId);
  }, [otherReadId, messages]);

  const lastOwnIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user?.id) return i;
    }
    return -1;
  }, [messages, user?.id]);

  if (conversationsQuery.isLoading) return <LoadingSpinner />;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-canvas">
      {/* Conversation List */}
      <div className="w-80 bg-surface-card border-r border-hairline overflow-y-auto">
        <div className="p-4 border-b border-hairline">
          <h1 className="text-lg font-display font-semibold text-ink">Tin nhắn</h1>
        </div>
        <div className="space-y-1 p-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Chưa có cuộc trò chuyện nào</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                  selectedId === c.id ? 'bg-surface-strong' : 'hover:bg-surface-strong'
                }`}
              >
                <div className="relative">
                  <Avatar name={c.otherUser.fullName} url={c.otherUser.avatarUrl} />
                  {onlineUsers.has(c.otherUserId) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-leaf border-2 border-surface-card rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{c.otherUser.fullName}</p>
                  <p className="text-sm text-muted truncate">
                    {c.lastMessage
                      ? c.lastMessage.isDeleted
                        ? 'Tin nhắn đã thu hồi'
                        : c.lastMessage.messageType !== 'text'
                          ? `[${c.lastMessage.messageType}]`
                          : c.lastMessage.content
                      : 'Bắt đầu trò chuyện'}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-sky text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center shrink-0">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat View */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 bg-surface-card border-b border-hairline flex items-center gap-3">
            <Avatar name={selected.otherUser.fullName} url={selected.otherUser.avatarUrl} size={36} />
            <div>
              <p className="font-medium text-ink">{selected.otherUser.fullName}</p>
              {onlineUsers.has(selected.otherUserId) ? (
                <span className="flex items-center gap-1 text-xs text-leaf">
                  <span className="w-2 h-2 bg-leaf rounded-full" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <span className="w-2 h-2 bg-gray-400 rounded-full" /> Offline
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas">
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
                const isOwn = msg.senderId === user?.id;
                const seen = isOwn && idx === lastOwnIndex && readIndex >= idx;
                return (
                  <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    <div className={`group flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <div className="relative max-w-md lg:max-w-2xl">
                        {/* Bubble */}
                        {editingId === msg.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSubmit(msg.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="px-3 py-2 rounded-lg border border-sky bg-canvas text-ink text-sm focus:outline-none"
                            />
                            <button onClick={() => handleEditSubmit(msg.id)} className="text-leaf">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-muted">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`px-4 py-2 rounded-lg ${
                              isOwn ? 'bg-sky text-white' : 'bg-surface-strong text-ink'
                            }`}
                          >
                            {msg.isDeleted ? (
                              <p className="italic opacity-70 text-sm">Tin nhắn đã thu hồi</p>
                            ) : (
                              <>
                                {msg.attachments.map((att) => (
                                  <div key={att.id} className="mb-1">
                                    {msg.messageType === 'image' ? (
                                      <a href={att.fileUrl} target="_blank" rel="noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={att.fileUrl} alt={att.fileName} className="rounded-lg max-h-60 object-cover" />
                                      </a>
                                    ) : msg.messageType === 'video' ? (
                                      <video src={att.fileUrl} controls className="rounded-lg max-h-60" />
                                    ) : msg.messageType === 'audio' ? (
                                      <audio src={att.fileUrl} controls className="max-w-full" />
                                    ) : (
                                      <a
                                        href={att.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 underline"
                                      >
                                        <Paperclip className="w-4 h-4" />
                                        <span className="text-sm">
                                          {att.fileName} ({formatSize(att.fileSize)})
                                        </span>
                                      </a>
                                    )}
                                  </div>
                                ))}
                                {msg.content && <p className="wrap-break-word whitespace-pre-wrap">{msg.content}</p>}
                                <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-muted'}`}>
                                  {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  {msg.editedAt && ' · đã sửa'}
                                </p>
                              </>
                            )}
                          </div>
                        )}

                        {/* Reaction picker */}
                        {reactionPickerFor === msg.id && (
                          <div data-reaction-ui className="absolute top-full mt-1 z-10 flex gap-1 bg-surface-card border border-hairline rounded-full px-2 py-1 shadow-lg">
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} onClick={() => toggleReaction(msg, e)} className="hover:scale-125 transition-transform">
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hover actions */}
                      {!msg.isDeleted && editingId !== msg.id && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-muted">
                          <button
                            data-reaction-ui
                            onClick={() => setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)}
                            className="hover:text-ink"
                            title="Thả cảm xúc"
                          >
                            <Smile className="w-4 h-4" />
                          </button>
                          {isOwn && msg.messageType === 'text' && (
                            <button
                              onClick={() => {
                                setEditingId(msg.id);
                                setEditingText(msg.content ?? '');
                              }}
                              className="hover:text-ink"
                              title="Sửa"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isOwn && (
                            <button
                              onClick={() => socket.deleteMessage(msg.id)}
                              className="hover:text-red-500"
                              title="Thu hồi"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Reactions summary */}
                    {msg.reactions.length > 0 && (
                      <div className={`flex gap-1 mt-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                        {Object.entries(
                          msg.reactions.reduce<Record<string, number>>((acc, r) => {
                            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                            return acc;
                          }, {}),
                        ).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg, emoji)}
                            className="text-xs bg-surface-strong rounded-full px-2 py-0.5 border border-hairline"
                          >
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}

                    {seen && <p className="text-xs text-muted mt-0.5">Đã xem</p>}
                  </div>
                );
              })
            )}
            {selected && typingUsers.has(selected.otherUserId) && (
              <div className="flex justify-start">
                <div className="bg-surface-strong text-muted px-4 py-2 rounded-lg">
                  <span className="flex items-center gap-1 text-sm">
                    {selected.otherUser.fullName} đang nhập
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 bg-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-1 bg-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-1 bg-muted rounded-full animate-bounce" />
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-surface-card border-t border-hairline flex items-center gap-2">
            <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !socket.isConnected}
              className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-strong disabled:opacity-50 transition-colors"
              title="Đính kèm tệp"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              onBlur={emitStopTyping}
              placeholder={uploading ? 'Đang tải tệp lên...' : 'Nhập tin nhắn...'}
              className="flex-1 px-3 py-2 rounded-lg border border-hairline bg-canvas text-ink placeholder-muted focus:outline-none focus:border-blue-500"
              disabled={!socket.isConnected}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !socket.isConnected}
              className="p-2 rounded-lg bg-sky text-white hover:bg-sky-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-canvas text-muted">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Chọn một cuộc trò chuyện để bắt đầu</p>
          </div>
        </div>
      )}
    </div>
  );
}
