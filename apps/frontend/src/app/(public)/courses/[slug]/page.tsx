'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  courseApi,
  enrollmentApi,
  orderApi,
  type SepayPaymentInfo,
  type CouponPreview,
} from '@/lib/api/course.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { StarRating } from '@/components/ui/StarRating';
import { PaymentQrModal } from '@/components/payment/PaymentQrModal';
import { ReviewSection } from '@/components/review/ReviewSection';
import { formatDuration, formatVND } from '@/lib/utils';
import { useState } from 'react';

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-semantic-success">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [enrollError, setEnrollError] = useState('');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [payment, setPayment] = useState<SepayPaymentInfo | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['course', slug],
    queryFn: () => courseApi.getCourseBySlug(slug),
  });

  const { data: enrollData } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => enrollmentApi.getMyEnrollments(),
    enabled: !!user,
  });

  const course = data?.data;
  const enrollments: any[] = enrollData?.data ?? [];
  const isEnrolled = enrollments.some((e: any) => e.courseId === course?.id);
  const isOwner = !!user && course?.instructor?.id === user.id;

  const enrollMutation = useMutation({
    mutationFn: () => enrollmentApi.enrollFree(course.id),
    onSuccess: () => router.push(`/learn/${course.id}`),
    onError: (err: any) => setEnrollError(err?.response?.data?.message ?? 'Lỗi đăng ký'),
  });

  const validateCouponMutation = useMutation({
    mutationFn: () => orderApi.validateCoupon(couponInput.trim(), course.id),
    onSuccess: ({ data }) => {
      setAppliedCoupon(data);
      setCouponError('');
    },
    onError: (err: any) => {
      setAppliedCoupon(null);
      setCouponError(err?.response?.data?.message ?? 'Mã không hợp lệ');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const key = `${user!.id}-${course.id}-${Date.now()}`;
      const { data: order } = await orderApi.createOrder(
        [course.id],
        key,
        appliedCoupon?.code,
      );
      // Mã giảm 100% → đơn 0đ đã được thanh toán và ghi danh ngay, bỏ qua QR.
      if (order.status === 'paid') return null;
      const { data: paymentInfo } = await orderApi.initiatePayment(order.orderId);
      return paymentInfo;
    },
    onSuccess: (paymentInfo) => {
      if (paymentInfo) setPayment(paymentInfo);
      else router.push(`/learn/${course.id}`);
    },
    onError: (err: any) => setEnrollError(err?.response?.data?.message ?? 'Lỗi thanh toán'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !course) return <ErrorMessage message="Không tìm thấy khóa học" />;

  const isFree = Number(course.price) === 0;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Page header band */}
      <div className="bg-surface-dark py-10">
        <div className="max-w-300 mx-auto px-6">
          <h1 className="font-display text-3xl md:text-4xl text-white mb-3">{course.title}</h1>
          {course.shortDescription && (
            <p className="text-[15px] text-white/70 mb-4 max-w-3xl">{course.shortDescription}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
            {course.instructor && (
              <p className="text-sm text-white/60">
                Giảng viên: <span className="text-white/90">{course.instructor.fullName}</span>
              </p>
            )}
            {course.avgRating > 0 && (
              <span className="rounded-full bg-white/10 px-2.5 py-1">
                <StarRating rating={course.avgRating} count={course.totalReviews} />
              </span>
            )}
            {course.level && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
                {LEVEL_LABELS[course.level] ?? course.level}
              </span>
            )}
            {course.category && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
                {course.category.name}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-white/60">
            {course.totalLessons > 0 && (
              <span className="flex items-center gap-1.5">
                <BookIcon />
                {course.totalLessons} bài học
              </span>
            )}
            {course.totalDurationSec > 0 && (
              <span className="flex items-center gap-1.5">
                <ClockIcon />
                {formatDuration(course.totalDurationSec)}
              </span>
            )}
            {course.totalStudents > 0 && (
              <span className="flex items-center gap-1.5">
                <UsersIcon />
                {course.totalStudents.toLocaleString()} học viên
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-300 mx-auto px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left: details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Objectives */}
            {course.objectives?.length > 0 && (
              <section className="rounded-2xl border border-hairline bg-surface-card p-6">
                <h2 className="font-display text-2xl text-ink mb-4">Bạn sẽ học được gì</h2>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {course.objectives.map((obj: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm text-body-copy">
                      <CheckIcon />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Description */}
            {course.description && (
              <section>
                <h2 className="font-display text-2xl text-ink mb-3">Giới thiệu khóa học</h2>
                <p className="text-body-copy leading-relaxed whitespace-pre-line">{course.description}</p>
              </section>
            )}

            {/* Requirements */}
            {course.requirements?.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-ink mb-3">Yêu cầu</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-body-copy">
                  {course.requirements.map((req: string, i: number) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Target audience */}
            {course.targetAudience?.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-ink mb-3">Khóa học này dành cho ai</h2>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-body-copy">
                  {course.targetAudience.map((aud: string, i: number) => (
                    <li key={i}>{aud}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Syllabus */}
            {course.sections?.length > 0 && (
              <section>
                <h2 className="font-display text-2xl text-ink mb-4">Nội dung khóa học</h2>
                <div className="space-y-2">
                  {course.sections.map((section: any) => {
                    const isOpen = openSection === section.id;
                    return (
                      <div key={section.id} className="bg-surface-card rounded-xl border border-hairline overflow-hidden">
                        <button
                          onClick={() => setOpenSection(isOpen ? null : section.id)}
                          className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-canvas transition-colors"
                        >
                          <span className="text-[15px] font-medium text-ink">
                            {section.title}
                            <span className="ml-2 text-xs text-muted font-normal">
                              {section.lessons?.length ?? 0} bài
                            </span>
                          </span>
                          <ChevronIcon open={isOpen} />
                        </button>
                        {isOpen && section.lessons?.length > 0 && (
                          <ul className="border-t border-hairline divide-y divide-hairline-soft">
                            {section.lessons.map((lesson: any) => (
                              <li
                                key={lesson.id}
                                className="flex items-center justify-between px-4 py-2.5 text-sm"
                              >
                                <span className="text-body-copy">{lesson.title}</span>
                                <span className={`flex items-center gap-1 text-xs ${lesson.isPreview ? 'text-semantic-success' : 'text-muted-soft'}`}>
                                  {lesson.isPreview ? (
                                    <>
                                      <PlayIcon />
                                      Xem thử
                                    </>
                                  ) : (
                                    <>
                                      <LockIcon />
                                      Đã khoá
                                    </>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Instructor */}
            {course.instructor && (course.instructor.bio || course.instructor.fullName) && (
              <section>
                <h2 className="font-display text-2xl text-ink mb-3">Giảng viên</h2>
                <div className="flex items-start gap-4 rounded-2xl border border-hairline bg-surface-card p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emphasis/10 text-lg font-semibold text-emphasis">
                    {course.instructor.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={course.instructor.avatarUrl} alt={course.instructor.fullName} className="h-full w-full object-cover" />
                    ) : (
                      course.instructor.fullName?.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{course.instructor.fullName}</p>
                    {course.instructor.bio && (
                      <p className="mt-1 text-sm leading-relaxed text-body-copy">{course.instructor.bio}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Reviews */}
            <ReviewSection courseId={course.id} canWrite={isEnrolled && !isOwner} />
          </div>

          {/* Right: CTA card */}
          <div className="lg:sticky lg:top-24 self-start">
            <div className="bg-surface-card rounded-2xl border border-hairline p-6 shadow-[0_4px_16px_rgba(0,0,0,0.06)] space-y-5">
              <PriceDisplay
                price={appliedCoupon ? appliedCoupon.finalAmount : Number(course.price)}
                originalPrice={appliedCoupon ? appliedCoupon.originalAmount : undefined}
                className="text-2xl"
              />

              {enrollError && <ErrorMessage message={enrollError} />}

              {!user ? (
                <button
                  onClick={() => router.push('/login')}
                  className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors"
                >
                  Đăng nhập để đăng ký
                </button>
              ) : isOwner ? (
                <Link
                  href={`/instructor/courses/${course.id}/manage/curriculum`}
                  className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors"
                >
                  Quản lý khóa học
                </Link>
              ) : isEnrolled ? (
                <button
                  onClick={() => router.push(`/learn/${course.id}`)}
                  className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-semantic-success text-white text-[15px] font-medium hover:opacity-90 transition-opacity"
                >
                  Tiếp tục học
                </button>
              ) : isFree ? (
                <button
                  onClick={() => enrollMutation.mutate()}
                  disabled={enrollMutation.isPending}
                  className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors disabled:opacity-50"
                >
                  {enrollMutation.isPending ? 'Đang đăng ký...' : 'Học miễn phí'}
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Mã giảm giá */}
                  <div className="space-y-1.5">
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between rounded-xl border border-semantic-success/30 bg-semantic-success/5 px-3 py-2">
                        <span className="text-sm">
                          <span className="font-semibold text-semantic-success">{appliedCoupon.code}</span>
                          <span className="text-muted">
                            {' '}· giảm {appliedCoupon.discountPct}% (−{formatVND(appliedCoupon.discountAmount)})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponInput('');
                            setCouponError('');
                          }}
                          className="text-xs text-muted hover:text-ink shrink-0"
                        >
                          Bỏ
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && couponInput.trim()) validateCouponMutation.mutate();
                          }}
                          placeholder="Mã giảm giá"
                          className="flex-1 h-10 rounded-pill border border-hairline px-4 text-sm uppercase placeholder:normal-case focus:outline-none focus:border-emphasis"
                        />
                        <button
                          type="button"
                          onClick={() => validateCouponMutation.mutate()}
                          disabled={!couponInput.trim() || validateCouponMutation.isPending}
                          className="h-10 px-4 rounded-pill border border-emphasis text-emphasis text-sm font-medium hover:bg-emphasis hover:text-white transition-colors disabled:opacity-50"
                        >
                          {validateCouponMutation.isPending ? '...' : 'Áp dụng'}
                        </button>
                      </div>
                    )}
                    {couponError && <p className="text-xs text-red-600">{couponError}</p>}
                  </div>

                  <button
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors disabled:opacity-50"
                  >
                    {checkoutMutation.isPending ? 'Đang xử lý...' : 'Mua ngay'}
                  </button>
                </div>
              )}

              {/* Community is enrollment-gated (backend enforces it too). */}
              {isEnrolled && (
                <Link
                  href={`/courses/${slug}/community`}
                  className="w-full inline-flex h-11 items-center justify-center rounded-pill border border-hairline text-ink text-[15px] font-medium hover:bg-canvas transition-colors"
                >
                  Cộng đồng khóa học
                </Link>
              )}

              <div className="pt-2 border-t border-hairline space-y-2 text-sm text-muted">
                {course.totalLessons > 0 && (
                  <div className="flex items-center gap-2">
                    <BookIcon />
                    {course.totalLessons} bài học
                  </div>
                )}
                {course.totalDurationSec > 0 && (
                  <div className="flex items-center gap-2">
                    <ClockIcon />
                    {formatDuration(course.totalDurationSec ?? 0)}
                  </div>
                )}
                {course.totalStudents > 0 && (
                  <div className="flex items-center gap-2">
                    <UsersIcon />
                    {course.totalStudents.toLocaleString()} học viên
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {payment && (
        <PaymentQrModal
          payment={payment}
          courseId={course.id}
          onClose={() => setPayment(null)}
          onPaid={() => router.push(`/learn/${course.id}`)}
        />
      )}
    </div>
  );
}
