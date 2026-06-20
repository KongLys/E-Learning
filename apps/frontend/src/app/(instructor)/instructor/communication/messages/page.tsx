'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, ChatMessage, Conversation } from '@/lib/api/chat.api';
import { useAuthStore } from '@/store/auth.store';
import { useChatSocket } from '@/hooks/use-chat-socket';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageCircle, Send, Paperclip, Smile, Pencil, Trash2, X, Check, ArrowLeft } from 'lucide-react';

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
      className="rounded-full bg-sky text-white flex items-center justify-center font-medium shrink-0 text-sm"
      style={{ width: size, height: size }}
    >
      {name?.charAt(0).toUpperCase() ?? '?'}
    </div>
  );
}

export default function MessagesPage() {
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
  const [mounted, setMounted] = useState(false);

  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const ownTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

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

  useEffect(() => {
    if (selectedId && socket.isConnected) socket.joinConversation(selectedId);
  }, [selectedId, socket.isConnected]);

  useEffect(() => {
    if (!messagesQuery.data) return;
    setMessages(messagesQuery.data);
    if (selectedId && socket.isConnected) {
      socket.markRead(selectedId);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-rooms-unread'] });
    }
  }, [messagesQuery.data, selectedId, socket.isConnected]);

  useEffect(() => {
    setTypingUsers(new Set());
    setOtherReadId(null);
    setEditingId(null);
    setReactionPickerFor(null);
    typingClearTimers.current.forEach((t) => clearTimeout(t));
    typingClearTimers.current.clear();
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

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

  useEffect(() => {
    const subs = [
      socket.onNewMessage((msg) => {
        if (msg.conversationId === selectedId) {
          upsertMessage(msg);
          socket.markRead(selectedId);
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
      socket.onMessageEdited((msg) => { if (msg.conversationId === selectedId) upsertMessage(msg); }),
      socket.onMessageDeleted((msg) => {
        if (msg.conversationId === selectedId) upsertMessage(msg);
        qc.invalidateQueries({ queryKey: ['conversations'] });
      }),
      socket.onReactionUpdated(({ messageId, reactions }) => {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      }),
      socket.onUserOnline((d) => setOnlineUsers((prev) => new Set([...prev, d.userId]))),
      socket.onUserOffline((d) => setOnlineUsers((prev) => { const n = new Set(prev); n.delete(d.userId); return n; })),
      socket.onMessageRead((d) => {
        if (d.conversationId === selectedId && d.userId !== user?.id) setOtherReadId(d.lastReadMessageId);
      }),
      socket.onUserTyping((d) => {
        if (d.conversationId !== selectedId || d.userId === user?.id) return;
        setTypingUsers((prev) => { const n = new Set(prev); if (d.isTyping) n.add(d.userId); else n.delete(d.userId); return n; });
        const timers = typingClearTimers.current;
        const existing = timers.get(d.userId);
        if (existing) clearTimeout(existing);
        if (d.isTyping) {
          timers.set(d.userId, setTimeout(() => {
            setTypingUsers((prev) => { const n = new Set(prev); n.delete(d.userId); return n; });
            timers.delete(d.userId);
          }, 4000));
        }
      }),
    ];
    return () => subs.forEach((u) => u());
  }, [selectedId, socket, qc, user?.id]);

  const emitStopTyping = () => {
    if (ownTypingTimer.current) { clearTimeout(ownTypingTimer.current); ownTypingTimer.current = null; }
    if (selectedId) socket.sendTyping(selectedId, false);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!selectedId) return;
    if (value.trim()) {
      socket.sendTyping(selectedId, true);
      if (ownTypingTimer.current) clearTimeout(ownTypingTimer.current);
      ownTypingTimer.current = setTimeout(() => { socket.sendTyping(selectedId, false); ownTypingTimer.current = null; }, 1500);
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

  if (!mounted || conversationsQuery.isLoading) return <LoadingSpinner />;

  return createPortal(
    <div className="fixed top-12 bottom-0 left-0 lg:left-60 right-0 flex bg-surface-card border-t border-l border-hairline z-50">
      {/* Conversation List — hidden on mobile when a chat is open */}
      <div className={`border-r border-hairline flex flex-col ${selectedId ? 'hidden lg:flex lg:w-72 lg:shrink-0' : 'flex-1 lg:w-72 lg:flex-none lg:shrink-0'}`}>
        <div className="px-4 py-3.5 border-b border-hairline">
          <h2 className="text-base font-semibold text-ink">Tin nhắn</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Chưa có cuộc trò chuyện</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                    selectedId === c.id ? 'bg-sky-soft' : 'hover:bg-canvas-soft'
                  }`}
                >
                  <div className="relative">
                    <Avatar name={c.otherUser.fullName} url={c.otherUser.avatarUrl} size={38} />
                    {onlineUsers.has(c.otherUserId) && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-leaf border-2 border-surface-card rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedId === c.id ? 'text-sky' : 'text-ink'}`}>
                      {c.otherUser.fullName}
                    </p>
                    <p className="text-xs text-ink-subtle truncate">
                      {c.lastMessage
                        ? c.lastMessage.isDeleted ? 'Tin nhắn đã thu hồi'
                          : c.lastMessage.messageType !== 'text' ? `[${c.lastMessage.messageType}]`
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
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area — hidden on mobile when no conversation selected */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-hairline flex items-center gap-3 bg-surface-card shrink-0">
            <button onClick={() => setSelectedId(null)} className="lg:hidden text-ink-subtle hover:text-ink -ml-1 shrink-0">
              <ArrowLeft size={18} />
            </button>
            <Avatar name={selected.otherUser.fullName} url={selected.otherUser.avatarUrl} size={34} />
            <div>
              <p className="text-sm font-semibold text-ink">{selected.otherUser.fullName}</p>
              {onlineUsers.has(selected.otherUserId) ? (
                <span className="flex items-center gap-1 text-xs text-leaf">
                  <span className="w-1.5 h-1.5 bg-leaf rounded-full" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-ink-subtle">
                  <span className="w-1.5 h-1.5 bg-ink-faint rounded-full" /> Offline
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas-soft">
            {messagesQuery.isLoading ? (
              <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted">
                Chưa có tin nhắn. Hãy bắt đầu!
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isOwn = msg.senderId === user?.id;
                const seen = isOwn && idx === lastOwnIndex && readIndex >= idx;
                return (
                  <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    <div className={`group flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <div className="relative max-w-sm">
                        {editingId === msg.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleEditSubmit(msg.id); if (e.key === 'Escape') setEditingId(null); }}
                              className="px-3 py-2 rounded-lg border border-sky bg-canvas text-ink text-sm focus:outline-none"
                            />
                            <button onClick={() => handleEditSubmit(msg.id)} className="text-leaf"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-ink-subtle"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className={`px-3.5 py-2 rounded-2xl text-sm ${isOwn ? 'bg-sky text-white rounded-br-sm' : 'bg-surface-card text-ink border border-hairline rounded-bl-sm'}`}>
                            {msg.isDeleted ? (
                              <p className="italic opacity-60 text-xs">Tin nhắn đã thu hồi</p>
                            ) : (
                              <>
                                {msg.attachments.map((att) => (
                                  <div key={att.id} className="mb-1">
                                    {msg.messageType === 'image' ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <a href={att.fileUrl} target="_blank" rel="noreferrer">
                                        <img src={att.fileUrl} alt={att.fileName} className="rounded-lg max-h-52 object-cover" />
                                      </a>
                                    ) : msg.messageType === 'video' ? (
                                      <video src={att.fileUrl} controls className="rounded-lg max-h-52" />
                                    ) : msg.messageType === 'audio' ? (
                                      <audio src={att.fileUrl} controls className="max-w-full" />
                                    ) : (
                                      <a href={att.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline text-xs">
                                        <Paperclip className="w-3 h-3" />
                                        {att.fileName} ({formatSize(att.fileSize)})
                                      </a>
                                    )}
                                  </div>
                                ))}
                                {msg.content && <p className="wrap-break-word whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                                <p className={`text-xs mt-1 ${isOwn ? 'text-sky-soft/80' : 'text-ink-subtle'}`}>
                                  {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  {msg.editedAt && ' · đã sửa'}
                                </p>
                              </>
                            )}
                          </div>
                        )}

                        {reactionPickerFor === msg.id && (
                          <div className="absolute -top-9 z-10 flex gap-1 bg-surface-card border border-hairline rounded-full px-2 py-1 shadow-lg">
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} onClick={() => toggleReaction(msg, e)} className="hover:scale-125 transition-transform">{e}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {!msg.isDeleted && editingId !== msg.id && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-ink-subtle">
                          <button onClick={() => setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)} className="hover:text-ink" title="Cảm xúc">
                            <Smile className="w-3.5 h-3.5" />
                          </button>
                          {isOwn && msg.messageType === 'text' && (
                            <button onClick={() => { setEditingId(msg.id); setEditingText(msg.content ?? ''); }} className="hover:text-ink" title="Sửa">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isOwn && (
                            <button onClick={() => socket.deleteMessage(msg.id)} className="hover:text-coral" title="Thu hồi">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.reactions.length > 0 && (
                      <div className={`flex gap-1 mt-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                        {Object.entries(msg.reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {})).map(([emoji, count]) => (
                          <button key={emoji} onClick={() => toggleReaction(msg, emoji)} className="text-xs bg-surface-card border border-hairline rounded-full px-2 py-0.5 hover:bg-canvas-soft">
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}
                    {seen && <p className="text-xs text-ink-subtle mt-0.5">Đã xem</p>}
                  </div>
                );
              })
            )}
            {selected && typingUsers.has(selected.otherUserId) && (
              <div className="flex justify-start">
                <div className="bg-surface-card border border-hairline text-muted px-3.5 py-2 rounded-2xl rounded-bl-sm text-sm">
                  {selected.otherUser.fullName} đang nhập
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="w-1 h-1 bg-ink-subtle rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-1 bg-ink-subtle rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-1 bg-ink-subtle rounded-full animate-bounce" />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-surface-card border-t border-hairline flex items-center gap-2 shrink-0">
            <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !socket.isConnected}
              className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-surface-strong disabled:opacity-40 transition-colors"
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
              className="flex-1 px-4 py-2 rounded-full border border-hairline-strong bg-canvas text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-sky"
              disabled={!socket.isConnected}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || !socket.isConnected}
              className="p-2 rounded-full bg-sky text-white hover:bg-sky-deep disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-canvas-soft">
          <div className="text-center">
            <MessageCircle className="w-14 h-14 mx-auto mb-3 text-ink-faint" />
            <p className="text-sm text-muted">Chọn cuộc trò chuyện để bắt đầu</p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
