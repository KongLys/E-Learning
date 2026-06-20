'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';

interface Props {
  courseId: string;
}

export function CourseThumbnailUpload({ courseId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: ['course-thumbnail', courseId],
    queryFn: () => instructorApi.getCourseById(courseId).then((r) => r.data),
  });

  const thumbnailUrl: string | undefined = data?.thumbnailUrl;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Ảnh tối đa 10MB');
      return;
    }
    setError('');
    setUploading(true);
    try {
      await instructorApi.uploadThumbnail(courseId, file);
      qc.invalidateQueries({ queryKey: ['course-thumbnail', courseId] });
    } catch {
      setError('Tải ảnh bìa thất bại, vui lòng thử lại');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="bg-surface-card border border-hairline rounded-card p-5">
      <h2 className="text-sm font-semibold mb-3">Ảnh bìa khóa học</h2>
      <div className="flex items-start gap-5">
        {/* Preview 16:9 */}
        <div
          className="relative w-56 flex-shrink-0 rounded-lg overflow-hidden border border-hairline cursor-pointer group"
          style={{ aspectRatio: '16/9' }}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {thumbnailUrl ? (
            <Image src={thumbnailUrl} alt="Ảnh bìa" fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas-soft text-ink-subtle">
              <ImageIcon className="w-8 h-8 mb-1" strokeWidth={1.5} />
              <span className="text-xs">Chưa có ảnh bìa</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? (
              <Loader2 className="animate-spin w-6 h-6 text-white" />
            ) : (
              <span className="text-white text-xs font-medium">Nhấn để thay đổi</span>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted leading-relaxed">
            Tải lên ảnh bìa hấp dẫn để thu hút học viên. Ảnh nên có tỉ lệ <strong>16:9</strong>.
          </p>
          <p className="text-xs text-ink-subtle">Định dạng: JPEG, PNG, WebP · Tối đa 10MB</p>
          {error && <p className="text-xs text-semantic-error">{error}</p>}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="text-xs bg-sky text-white px-3 py-1.5 rounded-lg hover:bg-sky-deep disabled:opacity-50"
          >
            {uploading ? 'Đang tải...' : thumbnailUrl ? 'Thay đổi ảnh bìa' : 'Tải ảnh bìa lên'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
