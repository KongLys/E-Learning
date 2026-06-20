'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4"
      onClick={() => {
        if (!isDirty) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="my-8 w-full max-w-lg rounded-modal bg-surface-card shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Thêm bài học</h2>
            {sectionTitle && (
              <p className="truncate text-xs text-ink-subtle">
                vào phần: <span className="font-medium text-muted">{sectionTitle}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="leading-none text-ink-subtle hover:text-ink" aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-coral bg-coral-soft px-3 py-2 text-sm text-semantic-error">{error}</div>
          )}

          <div>
            <label className="text-xs text-muted">
              Tiêu đề <span className="text-coral">*</span>
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
              className="w-full rounded-xl bg-surface-card px-3 py-2.5 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
            />
            {trimmedTitle.length > 0 && trimmedTitle.length < 2 && (
              <p className="mt-1 text-xs text-sun-deep">Tiêu đề cần ít nhất 2 ký tự.</p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted">
              Mục tiêu học tập <span className="text-ink-subtle">(không bắt buộc)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Học viên có thể làm được gì sau khi hoàn thành bài học này?"
              className="w-full rounded-xl bg-surface-card px-3 py-2.5 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">Loại bài học</label>
            <div className="grid grid-cols-3 gap-2">
              {LESSON_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    type === t
                      ? 'border-sky bg-sky-soft font-medium text-sky-deep'
                      : 'border-hairline text-ink-mute hover:bg-canvas-soft'
                  }`}
                >
                  <LessonTypeIcon type={t} size={15} />
                  {LESSON_TYPE_META[t].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-subtle">
              {TYPE_HINTS[type]} Không thể đổi loại bài học sau khi tạo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-hairline px-6 py-4">
          {addedCount > 0 && (
            <span className="text-xs font-medium text-leaf">Đã thêm {addedCount} bài học</span>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-pill px-4 py-2 text-sm text-ink-mute transition-colors hover:bg-surface-strong"
          >
            Đóng
          </button>
          <button
            onClick={() => submit(true)}
            disabled={!canSubmit}
            className="rounded-pill border border-sky-soft px-4 py-2 text-sm font-medium text-sky transition-colors hover:bg-sky-soft disabled:opacity-50"
          >
            Lưu & thêm tiếp
          </button>
          <button
            onClick={() => submit(false)}
            disabled={!canSubmit}
            className="rounded-pill bg-sky px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-deep disabled:opacity-50"
          >
            {isPending ? 'Đang thêm...' : 'Thêm bài học'}
          </button>
        </div>
      </div>
    </div>
  );
}
