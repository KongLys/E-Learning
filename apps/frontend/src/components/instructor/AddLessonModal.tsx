'use client';

import { useState } from 'react';
import { LESSON_TYPES, LESSON_TYPE_META, LessonTypeIcon, type LessonType } from './lessonTypeMeta';

interface AddLessonModalProps {
  onSubmit: (data: { title: string; type: LessonType; description: string }) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function AddLessonModal({ onSubmit, onClose, isPending }: AddLessonModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<LessonType>('video');

  const canSubmit = title.trim().length >= 2 && !isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">Thêm bài học</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-gray-500">Tiêu đề</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên bài học..."
              className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Mục tiêu học tập</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Học viên có thể làm được gì sau khi hoàn thành bài học này?"
              className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Loại bài học</label>
            <div className="grid grid-cols-3 gap-2">
              {LESSON_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    type === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LessonTypeIcon type={t} size={15} />
                  {LESSON_TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-100 transition-colors">
            Hủy
          </button>
          <button
            onClick={() => onSubmit({ title: title.trim(), type, description: description.trim() })}
            disabled={!canSubmit}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-full font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Đang thêm...' : 'Thêm bài học'}
          </button>
        </div>
      </div>
    </div>
  );
}
