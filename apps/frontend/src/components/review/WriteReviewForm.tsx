'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewApi, type Review } from '@/lib/api/review.api';
import { StarInput } from './StarInput';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface WriteReviewFormProps {
  courseId: string;
  existing: Review | null;
}

/** Form viết / sửa / xóa đánh giá của học viên hiện tại. */
export function WriteReviewForm({ courseId, existing }: WriteReviewFormProps) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [content, setContent] = useState(existing?.content ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setRating(existing?.rating ?? 0);
    setContent(existing?.content ?? '');
  }, [existing]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['course-reviews', courseId] });
    queryClient.invalidateQueries({ queryKey: ['my-review', courseId] });
    queryClient.invalidateQueries({ queryKey: ['course'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => reviewApi.submitReview(courseId, { rating, content: content || undefined }),
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Không thể gửi đánh giá'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => reviewApi.deleteMyReview(courseId),
    onSuccess: () => {
      setConfirmDelete(false);
      invalidate();
    },
    onError: (err: any) => {
      setConfirmDelete(false);
      setError(err?.response?.data?.message ?? 'Không thể xóa đánh giá');
    },
  });

  const submit = () => {
    if (rating < 1) {
      setError('Vui lòng chọn số sao');
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-5">
      <h3 className="mb-3 text-[15px] font-semibold text-ink">
        {existing ? 'Chỉnh sửa đánh giá của bạn' : 'Viết đánh giá'}
      </h3>

      <StarInput value={rating} onChange={setRating} />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Chia sẻ cảm nhận của bạn về khóa học..."
        className="mt-3 w-full resize-none rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink focus:border-emphasis focus:outline-none"
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={submitMutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-pill bg-emphasis px-5 text-sm font-medium text-white transition-colors hover:bg-ink disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Đang lưu...' : existing ? 'Cập nhật' : 'Gửi đánh giá'}
        </button>
        {existing && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-10 items-center justify-center rounded-pill border border-hairline px-4 text-sm font-medium text-muted transition-colors hover:bg-canvas"
          >
            Xóa đánh giá
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Xóa đánh giá?"
          message="Đánh giá của bạn sẽ bị xóa khỏi khóa học này."
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
