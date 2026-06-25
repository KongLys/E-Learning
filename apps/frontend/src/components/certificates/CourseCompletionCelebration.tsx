'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Award, Loader2, X } from 'lucide-react';
import { certificateApi } from '@/lib/api/certificate.api';

// Trình xem/tải PDF chỉ chạy phía client.
const CertificatePreview = dynamic(
  () => import('./CertificatePreview'),
  { ssr: false },
);

export interface CourseCompletionCelebrationProps {
  courseId: string;
  courseTitle?: string;
  onClose: () => void;
}

/**
 * Popup tự bật khi học viên vừa hoàn thành một khóa TRẢ PHÍ — chúc mừng và
 * mở chứng chỉ. Chứng chỉ được lazy-create phía backend (đã giới hạn khóa
 * trả phí), nên chỉ cần gọi getByCourse.
 */
export default function CourseCompletionCelebration({
  courseId,
  courseTitle,
  onClose,
}: CourseCompletionCelebrationProps) {
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificate-by-course', courseId],
    queryFn: () => certificateApi.getByCourse(courseId),
  });
  const cert = data?.data;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (showPreview) setShowPreview(false);
      else onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, showPreview]);

  // Đang xem chứng chỉ — tái dùng modal preview toàn màn hình.
  if (showPreview && cert) {
    return <CertificatePreview data={cert} onClose={() => setShowPreview(false)} />;
  }

  return (
    <div
      className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Award size={32} />
        </div>

        <div className="mb-1 text-3xl" aria-hidden>🎉</div>
        <h2 className="text-xl font-bold text-gray-900">
          Chúc mừng! Bạn đã hoàn thành khóa học
        </h2>
        {courseTitle && (
          <p className="mt-1 font-medium text-gray-700">{courseTitle}</p>
        )}
        <p className="mt-2 text-sm text-gray-500">
          Chứng chỉ hoàn thành của bạn đã sẵn sàng. Xem và tải về ngay nhé!
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => setShowPreview(true)}
            disabled={isLoading || isError || !cert}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-emphasis px-5 text-sm font-semibold text-white transition-colors hover:bg-ink disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Đang chuẩn bị…
              </>
            ) : (
              <>
                <Award size={16} /> Xem chứng chỉ
              </>
            )}
          </button>
          {isError && (
            <p className="text-xs text-red-500">
              Chưa thể tải chứng chỉ lúc này. Bạn có thể xem lại ở mục “Chứng chỉ của tôi”.
            </p>
          )}
          <button
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-pill px-5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
