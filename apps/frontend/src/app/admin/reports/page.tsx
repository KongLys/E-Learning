'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { REPORT_REASON_LABELS } from '@/components/review/reportReasons';
import type { ReviewReportReason } from '@/lib/api/review.api';

interface ReportRow {
  id: string;
  reason: ReviewReportReason;
  detail: string | null;
  createdAt: string;
  reporter: { id: string; fullName: string; email: string };
  review: {
    id: string;
    rating: number;
    content: string | null;
    student: { id: string; fullName: string; email: string; status: string };
    course: { id: string; title: string; slug: string };
  };
}

type PendingAction =
  | { kind: 'delete'; report: ReportRow }
  | { kind: 'lock'; report: ReportRow }
  | null;

export default function AdminReportsPage() {
  const qc = useQueryClient();
  const [action, setAction] = useState<PendingAction>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-review-reports'],
    queryFn: () => adminApi.getReviewReports({ status: 'pending' }),
    refetchInterval: 30000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-review-reports'] });

  const resolveMutation = useMutation({
    mutationFn: ({ id, act }: { id: string; act: 'delete' | 'dismiss' }) =>
      adminApi.resolveReviewReport(id, act),
    onSuccess: () => {
      setAction(null);
      invalidate();
    },
  });

  const lockMutation = useMutation({
    mutationFn: (userId: string) => adminApi.updateUserStatus(userId, 'locked'),
    onSuccess: () => {
      setAction(null);
      invalidate();
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const reports: ReportRow[] = data?.data ?? [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">Báo cáo đánh giá</h1>
      <p className="text-sm text-gray-500 mb-6">
        Các bình luận đánh giá bị học viên báo cáo lạm dụng. Xóa nội dung vi phạm, khóa tài
        khoản người viết, hoặc bỏ qua nếu hợp lệ.
      </p>

      {reports.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Không có báo cáo nào cần xử lý.</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-white border rounded-xl p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded">
                    {REPORT_REASON_LABELS[r.reason]}
                  </span>
                  <span className="text-xs text-amber-500 leading-none">
                    {'★'.repeat(r.review.rating)}
                    <span className="text-gray-300">{'★'.repeat(5 - r.review.rating)}</span>
                  </span>
                </div>

                {r.review.content && (
                  <p className="text-sm text-gray-800 bg-gray-50 rounded p-2 mb-1">
                    “{r.review.content}”
                  </p>
                )}
                {r.detail && <p className="text-xs text-gray-500 mb-1">Chi tiết báo cáo: {r.detail}</p>}

                <p className="text-xs text-gray-500">
                  Khóa học: <span className="text-gray-700">{r.review.course.title}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Người viết:{' '}
                  <span className="text-gray-700">
                    {r.review.student.fullName} · {r.review.student.email}
                  </span>
                  {r.review.student.status === 'locked' && (
                    <span className="ml-1 text-red-600">(đã khóa)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  Báo cáo bởi {r.reporter.fullName} · {new Date(r.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => setAction({ kind: 'delete', report: r })}
                  disabled={resolveMutation.isPending}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Xóa đánh giá
                </button>
                <button
                  onClick={() => setAction({ kind: 'lock', report: r })}
                  disabled={lockMutation.isPending || r.review.student.status === 'locked'}
                  className="text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded hover:bg-amber-200 disabled:opacity-50"
                >
                  Khóa tài khoản
                </button>
                <button
                  onClick={() => resolveMutation.mutate({ id: r.id, act: 'dismiss' })}
                  disabled={resolveMutation.isPending}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {action?.kind === 'delete' && (
        <ConfirmDialog
          title="Xóa đánh giá vi phạm?"
          message="Đánh giá sẽ bị ẩn khỏi khóa học và báo cáo được đánh dấu đã xử lý."
          confirmLabel="Xóa đánh giá"
          isPending={resolveMutation.isPending}
          onConfirm={() => resolveMutation.mutate({ id: action.report.id, act: 'delete' })}
          onCancel={() => setAction(null)}
        />
      )}

      {action?.kind === 'lock' && (
        <ConfirmDialog
          title="Khóa tài khoản người viết?"
          message={`Tài khoản ${action.report.review.student.fullName} sẽ bị khóa và không thể đăng nhập.`}
          confirmLabel="Khóa tài khoản"
          isPending={lockMutation.isPending}
          onConfirm={() => lockMutation.mutate(action.report.review.student.id)}
          onCancel={() => setAction(null)}
        />
      )}
    </div>
  );
}
