import type { ReviewReportReason } from '@/lib/api/review.api';

/** Nhãn hiển thị cho từng loại vấn đề báo cáo (theo mẫu Udemy). */
export const REPORT_REASON_OPTIONS: { value: ReviewReportReason; label: string }[] = [
  { value: 'inappropriate_harmful', label: 'Nội dung khóa học không phù hợp - Có hại, bạo lực, thù hận hoặc tội phạm' },
  { value: 'inappropriate_other', label: 'Nội dung khóa học không phù hợp - Khác' },
  { value: 'misconduct', label: 'Hành vi không phù hợp' },
  { value: 'policy_violation', label: 'Vi phạm chính sách của Udemy' },
  { value: 'spam', label: 'Nội dung rác' },
  { value: 'inappropriate_ad', label: 'Nội dung quảng cáo không phù hợp' },
  { value: 'other', label: 'Ý khác' },
];

export const REPORT_REASON_LABELS: Record<ReviewReportReason, string> = Object.fromEntries(
  REPORT_REASON_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReviewReportReason, string>;
