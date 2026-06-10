'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { Check } from 'lucide-react';

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

  const { data } = useQuery({
    queryKey: ['course-thumbnail', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });
  const status: string | undefined = data?.status;
  const editable = status === 'draft' || status === 'rejected';

  const submitMutation = useMutation({
    mutationFn: () => instructorApi.submitCourse(id),
    onSuccess: () => alert('Khóa học đã được gửi để duyệt!'),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Gửi duyệt thất bại'),
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
      <section className="min-w-0 flex-1">
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">{children}</div>
      </section>
    </div>
  );
}
