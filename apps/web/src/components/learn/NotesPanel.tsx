'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';
import { formatSeconds } from './VideoPlayer';

interface NotesPanelProps {
  lessonId: string;
  positionType: 'video_timestamp' | 'document_page' | 'none';
  getCurrentPosition: () => number;
  onJumpTo?: (position: number) => void;
}

export function NotesPanel({ lessonId, positionType, getCurrentPosition, onJumpTo }: NotesPanelProps) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800">Ghi chú ({notes.length})</h3>
        <button onClick={startAdding} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
          + Thêm note
        </button>
      </div>

      {adding && (
        <div className="border rounded-lg p-3 space-y-2">
          {positionType !== 'none' && (
            <p className="text-xs text-blue-500">
              {positionType === 'video_timestamp' ? `Tại ${formatSeconds(capturedPos)}` : `Trang ${capturedPos}`}
            </p>
          )}
          <textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Nội dung ghi chú..."
            rows={3}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!newContent.trim()} className="text-xs bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">Lưu</button>
            <button onClick={() => setAdding(false)} className="text-xs border px-3 py-1 rounded">Hủy</button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {notes.map((note: any) => (
          <div key={note.id} className="border rounded-lg p-3 text-sm">
            {note.positionValue > 0 && (
              <button
                onClick={() => onJumpTo?.(note.positionValue)}
                className="text-xs text-blue-500 hover:underline mb-1 block"
              >
                {positionType === 'video_timestamp' ? `⏱ ${formatSeconds(note.positionValue)}` : `📄 Trang ${note.positionValue}`}
              </button>
            )}
            {editId === note.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => updateMutation.mutate(note.id)} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Lưu</button>
                  <button onClick={() => setEditId(null)} className="text-xs border px-2 py-0.5 rounded">Hủy</button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-2">
                <p className="text-gray-700">{note.content}</p>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditId(note.id); setEditContent(note.content); }} className="text-xs text-gray-400 hover:text-blue-500">✏</button>
                  <button onClick={() => deleteMutation.mutate(note.id)} className="text-xs text-gray-400 hover:text-red-500">🗑</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
