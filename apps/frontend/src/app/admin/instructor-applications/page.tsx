'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { notify, showPrompt } from '@/store/dialog.store';

type StatusFilter = 'pending' | 'approved' | 'rejected';

interface ApplicationItem {
  id: string;
  status: StatusFilter;
  expertise: string;
  experience: string;
  motivation: string;
  rejectReason: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string; avatarUrl: string | null };
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Đã từ chối' },
];

const STATUS_BADGE: Record<StatusFilter, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function AdminInstructorApplicationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-instructor-applications', status],
    queryFn: () => adminApi.getInstructorApplications({ status }),
    refetchInterval: 30000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-instructor-applications'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveInstructorApplication(id),
    onSuccess: () => {
      notify.success('Đã duyệt đơn. Học viên đã trở thành giảng viên.');
      invalidate();
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Thao tác thất bại'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.rejectInstructorApplication(id, reason),
    onSuccess: () => {
      notify.success('Đã từ chối đơn.');
      invalidate();
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Thao tác thất bại'),
  });

  const items: ApplicationItem[] = data?.data ?? [];

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">Đơn đăng ký giảng viên</h1>
      <p className="text-sm text-gray-500 mb-5">
        Học viên gửi đơn xin trở thành giảng viên. Duyệt để nâng tài khoản lên giảng
        viên, hoặc từ chối kèm lý do (học viên có thể nộp lại).
      </p>

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              status === tab.value
                ? 'bg-sky text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Không có đơn nào.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-medium">{item.user.fullName}</span>
                    <span className="text-xs text-gray-400">{item.user.email}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[item.status]}`}>
                      {STATUS_TABS.find((t) => t.value === item.status)?.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <dl className="space-y-1.5 text-sm">
                    <Detail label="Chuyên môn" value={item.expertise} />
                    <Detail label="Kinh nghiệm" value={item.experience} />
                    <Detail label="Lý do" value={item.motivation} />
                  </dl>
                  {item.rejectReason && (
                    <p className="text-xs text-red-600 mt-2">
                      Lý do từ chối: {item.rejectReason}
                    </p>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approveMutation.mutate(item.id)}
                      disabled={approveMutation.isPending}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Duyệt
                    </button>
                    <button
                      onClick={async () => {
                        const reason =
                          (await showPrompt({ title: 'Lý do từ chối (tùy chọn):' })) ?? undefined;
                        rejectMutation.mutate({ id: item.id, reason });
                      }}
                      disabled={rejectMutation.isPending}
                      className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-400 shrink-0 w-20">{label}:</dt>
      <dd className="text-gray-700 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
