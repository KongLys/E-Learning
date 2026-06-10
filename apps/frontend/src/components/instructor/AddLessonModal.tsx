'use client';

import { useRef, useState } from 'react';
import { LESSON_TYPES, LESSON_TYPE_META, LessonTypeIcon, type LessonType } from './lessonTypeMeta';

const TYPE_HINTS: Record<LessonType, string> = {
  video: 'Tải lên video bài giảng cho học viên xem.',
  document: 'Soạn nội dung bài đọc hoặc đính kèm tài liệu.',
  quiz: 'Tạo bộ câu hỏi trắc nghiệm kiểm tra kiến thức.',
};

interface AddLessonModalProps {
  /** Tên phần đang thêm bài học vào, hiển thị ở tiêu đề modal. */
  sectionTitle?: string;
  /** Trả về promise để modal tự quyết định đóng hay reset form (Lưu & thêm tiếp). */
  onSubmit: (data: { title: string; type: LessonType; description: string }) => Promise<unknown>;
  onClose: () => void;
  isPending?: boolean;
}

export function AddLessonModal({ sectionTitle, onSubmit, onClose, isPending }: AddLessonModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<LessonType>('video');
  const [error, setError] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length >= 2 && !isPending;
  const isDirty = trimmedTitle.length > 0 || description.trim().length > 0;

  const submit = async (addAnother: boolean) => {
    if (!canSubmit) return;
    setError('');
    try {
      await onSubmit({ title: trimmedTitle, type, description: description.trim() });
      if (addAnother) {
        setAddedCount((c) => c + 1);
        setTitle('');
        setDescription('');
        titleRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg ?? 'Không thể thêm bài học, vui lòng thử lại.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={() => {
        // Tránh mất dữ liệu đã nhập khi lỡ bấm ra ngoài
        if (!isDirty) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Thêm bài học</h2>
            {sectionTitle && (
              <p className="truncate text-xs text-gray-400">
                vào phần: <span className="font-medium text-gray-500">{sectionTitle}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="text-xs text-gray-500">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              ref={titleRef}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(false);
              }}
              placeholder="VD: Giới thiệu về React Hooks"
              className="w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
            />
            {trimmedTitle.length > 0 && trimmedTitle.length < 2 && (
              <p className="mt-1 text-xs text-amber-600">Tiêu đề cần ít nhất 2 ký tự.</p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500">
              Mục tiêu học tập <span className="text-gray-400">(không bắt buộc)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Học viên có thể làm được gì sau khi hoàn thành bài học này?"
              className="w-full rounded-xl bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-gray-500">Loại bài học</label>
            <div className="grid grid-cols-3 gap-2">
              {LESSON_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    type === t
                      ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LessonTypeIcon type={t} size={15} />
                  {LESSON_TYPE_META[t].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {TYPE_HINTS[type]} Không thể đổi loại bài học sau khi tạo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-4">
          {addedCount > 0 && (
            <span className="text-xs font-medium text-green-600">Đã thêm {addedCount} bài học</span>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-full px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
          >
            Đóng
          </button>
          <button
            onClick={() => submit(true)}
            disabled={!canSubmit}
            className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
          >
            Lưu & thêm tiếp
          </button>
          <button
            onClick={() => submit(false)}
            disabled={!canSubmit}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Đang thêm...' : 'Thêm bài học'}
          </button>
        </div>
      </div>
    </div>
  );
}
