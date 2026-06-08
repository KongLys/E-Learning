'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
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
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold mb-3">Ảnh bìa khóa học</h2>
      <div className="flex items-start gap-5">
        {/* Preview 16:9 */}
        <div
          className="relative w-56 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 cursor-pointer group"
          style={{ aspectRatio: '16/9' }}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {thumbnailUrl ? (
            <Image src={thumbnailUrl} alt="Ảnh bìa" fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
              <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">Chưa có ảnh bìa</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? (
              <svg className="animate-spin w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <span className="text-white text-xs font-medium">Nhấn để thay đổi</span>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-xs text-gray-500 leading-relaxed">
            Tải lên ảnh bìa hấp dẫn để thu hút học viên. Ảnh nên có tỉ lệ <strong>16:9</strong>.
          </p>
          <p className="text-xs text-gray-400">Định dạng: JPEG, PNG, WebP · Tối đa 10MB</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
