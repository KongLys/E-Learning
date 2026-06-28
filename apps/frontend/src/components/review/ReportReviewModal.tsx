'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { reviewApi, type ReviewReportReason } from '@/lib/api/review.api';
import { REPORT_REASON_OPTIONS } from './reportReasons';
import { getApiErrorMessage } from '@/lib/api/error';

interface ReportReviewModalProps {
  reviewId: string;
  onClose: () => void;
  onReported: () => void;
}

/** Hộp thoại "Báo cáo lạm dụng" cho một đánh giá (mô phỏng mẫu Udemy). */
export function ReportReviewModal({ reviewId, onClose, onReported }: ReportReviewModalProps) {
  const [reason, setReason] = useState<ReviewReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () => reviewApi.reportReview(reviewId, { reason: reason as ReviewReportReason, detail: detail || undefined }),
    onSuccess: onReported,
    onError: (err) => setError(getApiErrorMessage(err, 'Không thể gửi báo cáo')),
  });

  const submit = () => {
    if (!reason) {
      setError('Vui lòng chọn một vấn đề');
      return;
    }
    setError('');
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-gray-900">Báo cáo lạm dụng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-gray-500">
          Nhân viên hệ thống sẽ xem xét nội dung bị gắn cờ để xác định xem nội dung đó có vi phạm
          Điều khoản dịch vụ hoặc Nguyên tắc cộng đồng hay không.
        </p>

        <label className="mb-1.5 block text-sm font-semibold text-gray-900">Loại vấn đề</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as ReviewReportReason)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        >
          <option value="">Chọn một vấn đề</option>
          {REPORT_REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="mb-1.5 block text-sm font-semibold text-gray-900">
          Chi tiết <span className="font-normal text-gray-400">(không bắt buộc)</span>
        </label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Mô tả thêm về vấn đề..."
          className="mb-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={mutation.isPending}
            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {mutation.isPending ? 'Đang gửi...' : 'Gửi báo cáo'}
          </button>
        </div>
      </div>
    </div>
  );
}
