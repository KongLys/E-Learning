'use client';

import { Star } from 'lucide-react';
import type { ReviewSummary } from '@/lib/api/review.api';

/** Hiển thị điểm trung bình + thanh phân bố sao 1–5. */
export function RatingSummary({ summary }: { summary: ReviewSummary }) {
  const { avg, total, distribution } = summary;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex flex-col items-center justify-center px-4">
        <span className="font-display text-5xl text-ink">{avg.toFixed(1)}</span>
        <span className="mt-1 flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={16} className={i < Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
          ))}
        </span>
        <span className="mt-1 text-xs text-muted">{total.toLocaleString()} đánh giá</span>
      </div>

      <div className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-muted">{star} sao</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline-soft">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-muted-soft">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
