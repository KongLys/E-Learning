'use client';

import { useQuery } from '@tanstack/react-query';
import { reviewApi } from '@/lib/api/review.api';
import { useAuthStore } from '@/store/auth.store';
import { RatingSummary } from './RatingSummary';
import { ReviewItem } from './ReviewItem';
import { WriteReviewForm } from './WriteReviewForm';

interface ReviewSectionProps {
  courseId: string;
  /** Học viên đã ghi danh — được phép viết đánh giá (eligibility đầy đủ do backend kiểm). */
  canWrite: boolean;
}

export function ReviewSection({ courseId, canWrite }: ReviewSectionProps) {
  const { user } = useAuthStore();

  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ['course-reviews', courseId],
    queryFn: () => reviewApi.getCourseReviews(courseId),
  });

  const { data: myReviewData } = useQuery({
    queryKey: ['my-review', courseId],
    queryFn: () => reviewApi.getMyReview(courseId),
    enabled: canWrite,
  });

  const reviews = reviewsData?.data.reviews ?? [];
  const summary = reviewsData?.data.summary;
  const myReview = myReviewData?.data ?? null;

  return (
    <section id="reviews">
      <h2 className="mb-4 font-display text-2xl text-ink">Đánh giá của học viên</h2>

      {summary && summary.total > 0 && (
        <div className="mb-6 rounded-2xl border border-hairline bg-surface-card p-5">
          <RatingSummary summary={summary} />
        </div>
      )}

      {canWrite && (
        <div className="mb-6">
          <WriteReviewForm courseId={courseId} existing={myReview} />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Đang tải đánh giá...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">Chưa có đánh giá nào cho khóa học này.</p>
      ) : (
        <div className="rounded-2xl border border-hairline bg-surface-card px-5">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} canReport={!!user} />
          ))}
        </div>
      )}
    </section>
  );
}
