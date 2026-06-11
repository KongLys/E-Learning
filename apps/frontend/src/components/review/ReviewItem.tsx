'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import type { Review } from '@/lib/api/review.api';
import { ReportReviewModal } from './ReportReviewModal';

interface ReviewItemProps {
  review: Review;
  canReport: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function ReviewItem({ review, canReport }: ReviewItemProps) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const name = review.student?.fullName ?? 'Học viên';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3 border-b border-hairline-soft py-4 last:border-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emphasis/10 text-sm font-semibold text-emphasis">
        {review.student?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.student.avatarUrl} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          initial
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">{name}</span>
          <span className="text-xs text-muted-soft">{formatDate(review.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-sm leading-none text-amber-400">
          {'★'.repeat(review.rating)}
          <span className="text-gray-300">{'★'.repeat(5 - review.rating)}</span>
        </div>
        {review.content && <p className="mt-1.5 text-sm leading-relaxed text-body-copy">{review.content}</p>}

        {canReport && (
          <button
            onClick={() => setReporting(true)}
            disabled={reported}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-soft transition-colors hover:text-red-600 disabled:text-semantic-success disabled:hover:text-semantic-success"
          >
            <Flag size={12} />
            {reported ? 'Đã báo cáo' : 'Báo cáo'}
          </button>
        )}
      </div>

      {reporting && (
        <ReportReviewModal
          reviewId={review.id}
          onClose={() => setReporting(false)}
          onReported={() => {
            setReporting(false);
            setReported(true);
          }}
        />
      )}
    </div>
  );
}
