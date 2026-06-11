'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { Check, AlertTriangle } from 'lucide-react';

type NavItem = { segment: string; label: string };
type NavGroup = { heading: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Lên kế hoạch cho khóa học của bạn',
    items: [{ segment: 'goals', label: 'Học viên mục tiêu' }],
  },
  {
    heading: 'Tạo nội dung của bạn',
    items: [{ segment: 'curriculum', label: 'Khung chương trình' }],
  },
  {
    heading: 'Xuất bản khóa học của bạn',
    items: [
      { segment: 'landing', label: 'Trang tổng quan khóa học' },
      { segment: 'pricing', label: 'Định giá' },
      { segment: 'promotions', label: 'Khuyến mãi' },
      { segment: 'messages', label: 'Tin nhắn khóa học' },
    ],
  },
];

export default function ManageCourseLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/instructor/courses/${id}/manage`;
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['course-thumbnail', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });
  const status: string | undefined = data?.status;
  const editable = status === 'draft' || status === 'rejected';
  const isPublished = status === 'published';
  const isPending = status === 'pending';

  const submitMutation = useMutation({
    mutationFn: () => instructorApi.submitCourse(id),
    onSuccess: () => {
      alert('Khóa học đã được gửi để duyệt!');
      qc.invalidateQueries({ queryKey: ['course-thumbnail', id] });
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Gửi duyệt thất bại'),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => instructorApi.unpublishCourse(id),
    onSuccess: () => {
      alert('Đã hủy xuất bản. Bây giờ bạn có thể chỉnh sửa nội dung.');
      qc.invalidateQueries({ queryKey: ['course-thumbnail', id] });
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Hủy xuất bản thất bại'),
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
      {/* Editor sidebar */}
      <aside className="lg:w-64 shrink-0">
        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="text-sm font-bold text-gray-900 mb-2">{group.heading}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const href = `${base}/${item.segment}`;
                  const active = pathname === href || pathname.startsWith(href + '/');
                  return (
                    <li key={item.segment}>
                      <Link
                        href={href}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-300">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !editable}
            title={editable ? '' : 'Khóa học chỉ có thể gửi khi ở trạng thái nháp hoặc bị từ chối'}
            className="w-full rounded-full bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitMutation.isPending ? 'Đang gửi...' : 'Gửi đi để xem xét'}
          </button>
        </nav>
      </aside>

      {/* Section content */}
      <section className="min-w-0 flex-1 space-y-4">
        {/* Published / pending banner */}
        {(isPublished || isPending) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">
                {isPublished
                  ? 'Khóa học đang xuất bản — nội dung chỉ đọc'
                  : 'Khóa học đang chờ duyệt — nội dung chỉ đọc'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {isPublished
                  ? 'Để chỉnh sửa nội dung, hãy hủy xuất bản trước.'
                  : 'Để chỉnh sửa, hãy rút về nháp bằng cách hủy xuất bản.'}
              </p>
            </div>
            {isPublished && (
              <button
                onClick={() => unpublishMutation.mutate()}
                disabled={unpublishMutation.isPending}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {unpublishMutation.isPending ? 'Đang xử lý...' : 'Hủy xuất bản'}
              </button>
            )}
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">{children}</div>
      </section>
    </div>
  );
}
