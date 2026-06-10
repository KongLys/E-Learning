'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { formatSeconds } from './VideoPlayer';

interface NotesPanelProps {
  lessonId: string;
  lessonTitle?: string;
  positionType: 'video_timestamp' | 'document_page' | 'none';
  getCurrentPosition: () => number;
  onJumpTo?: (position: number) => void;
  addSignal?: number;
}

export function NotesPanel({ lessonId, lessonTitle, positionType, getCurrentPosition, onJumpTo, addSignal }: NotesPanelProps) {
  const qc = useQueryClient();
  const [newContent, setNewContent] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [capturedPos, setCapturedPos] = useState(0);

  const { data } = useQuery({
    queryKey: ['notes', lessonId],
    queryFn: () => learnApi.getNotes(lessonId),
  });
  const notes: any[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => learnApi.createNote(lessonId, newContent, positionType, capturedPos),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes', lessonId] }); setNewContent(''); setAdding(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => learnApi.updateNote(id, editContent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes', lessonId] }); setEditId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => learnApi.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', lessonId] }),
  });

  const startAdding = () => {
    setCapturedPos(Math.floor(getCurrentPosition()));
    setAdding(true);
  };

  // Mở form thêm ghi chú khi nhận tín hiệu từ nút "Lưu ghi chú" bên ngoài
  useEffect(() => {
    if (addSignal) startAdding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal]);

  const positionBadge = (value: number) => {
    if (positionType === 'video_timestamp') return `⏱ ${formatSeconds(value)}`;
    if (positionType === 'document_page') return `📄 Trang ${value}`;
    return '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Ghi chú của bạn <span className="text-gray-400 font-normal">· {notes.length}</span></h3>
        {!adding && notes.length > 0 && (
          <button onClick={startAdding} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-full">
            <span className="text-base leading-none">+</span> Thêm ghi chú
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-2xl bg-blue-50/70 p-4 space-y-3">
          {positionType !== 'none' && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white/70 px-2.5 py-1 rounded-full">
              {positionBadge(capturedPos)}{lessonTitle ? ` · ${lessonTitle}` : ''}
            </span>
          )}
          <textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Nội dung ghi chú..."
            rows={3}
            className="w-full text-sm bg-white rounded-xl px-3 py-2.5 resize-none outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!newContent.trim()} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-full font-medium hover:bg-blue-700 disabled:opacity-50">Lưu</button>
            <button onClick={() => setAdding(false)} className="text-sm text-gray-600 px-4 py-1.5 rounded-full hover:bg-gray-100">Hủy</button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <p className="text-base font-semibold text-gray-900 mb-1.5">Bắt đầu ghi chú của bạn</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed mb-5">
            Lưu lại ý chính ngay tại thời điểm đang xem. Mỗi ghi chú được gắn mốc thời gian — bấm vào để tua nhanh về đúng đoạn đó.
          </p>
          <button onClick={startAdding} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-full">
            Thêm ghi chú đầu tiên
          </button>
        </div>
      )}

      <div className="space-y-3 max-h-112 overflow-y-auto">
        {notes.map((note: any) => (
          <div key={note.id} className="group rounded-2xl bg-slate-50 p-4 transition-colors hover:bg-slate-100/80">
            <div className="flex items-center justify-between gap-2 mb-2">
              {note.positionValue > 0 ? (
                <button
                  onClick={() => onJumpTo?.(note.positionValue)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-full"
                >
                  {positionBadge(note.positionValue)}
                </button>
              ) : <span />}
              {editId !== note.id && (
                <div className="flex gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditId(note.id); setEditContent(note.content); }}
                    className="text-xs text-gray-600 hover:text-blue-600 hover:bg-white px-3 py-1.5 rounded-full"
                  >
                    ✏ Sửa
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(note.id)}
                    className="text-xs text-gray-600 hover:text-red-600 hover:bg-white px-3 py-1.5 rounded-full"
                  >
                    🗑 Xóa
                  </button>
                </div>
              )}
            </div>

            {editId === note.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full text-sm bg-white rounded-xl px-3 py-2.5 resize-none outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex gap-2">
                  <button onClick={() => updateMutation.mutate(note.id)} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-full font-medium">Lưu</button>
                  <button onClick={() => setEditId(null)} className="text-sm text-gray-600 px-4 py-1.5 rounded-full hover:bg-white">Hủy</button>
                </div>
              </div>
            ) : (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
