import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REVIEW_REPORT_REASONS = [
  'inappropriate_harmful',
  'inappropriate_other',
  'misconduct',
  'policy_violation',
  'spam',
  'inappropriate_ad',
  'other',
] as const;

export type ReviewReportReasonValue = (typeof REVIEW_REPORT_REASONS)[number];

export class ReportReviewDto {
  @IsIn(REVIEW_REPORT_REASONS)
  reason: ReviewReportReasonValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
