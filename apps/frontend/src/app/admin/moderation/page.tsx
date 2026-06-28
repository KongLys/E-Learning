'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import {
  MODERATION_COLORS,
  MODERATION_LABELS,
  type ModerationStatus,
} from '@/lib/api/ai.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { showPrompt } from '@/store/dialog.store';

type ContentType = 'course' | 'lesson';

interface ReviewItem {
  type: ContentType;
  id: string;
  title: string;
  subtitle?: string;
  instructor?: { fullName: string; email: string };
  moderationStatus: ModerationStatus;
  moderationLabel: string | null;
  moderationReason: string | null;
  appealReason: string | null;
  markdownUrl?: string | null;
}

interface ModerationRaw {
  id: string;
  title: string;
  instructor?: { fullName: string; email: string };
  moderationStatus: ModerationStatus;
  moderationLabel: string | null;
  moderationReason: string | null;
  appealReason: string | null;
  markdownUrl?: string | null;
  sectionTitle?: string;
  courseTitle?: string;
}

export default function AdminModerationPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-moderation'],
    queryFn: () => adminApi.getModeration(),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ type, id }: { type: ContentType; id: string }) =>
      adminApi.approveModeration(type, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-moderation'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ type, id, reason }: { type: ContentType; id: string; reason?: string }) =>
      adminApi.rejectModeration(type, id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-moderation'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  const courses: ReviewItem[] = (data?.data?.courses ?? []).map((c: ModerationRaw) => ({
    type: 'course' as const,
    id: c.id,
    title: c.title,
    subtitle: c.instructor?.fullName,
    instructor: c.instructor,
    moderationStatus: c.moderationStatus,
    moderationLabel: c.moderationLabel,
    moderationReason: c.moderationReason,
    appealReason: c.appealReason,
  }));
  const lessons: ReviewItem[] = (data?.data?.lessons ?? []).map((l: ModerationRaw) => ({
    type: 'lesson' as const,
    id: l.id,
    title: l.title,
    subtitle: l.sectionTitle ? `${l.courseTitle} · ${l.sectionTitle}` : l.courseTitle,
    instructor: l.instructor,
    moderationStatus: l.moderationStatus,
    moderationLabel: l.moderationLabel,
    moderationReason: l.moderationReason,
    appealReason: l.appealReason,
    markdownUrl: l.markdownUrl,
  }));
  const items = [...lessons, ...courses];

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">Kiểm duyệt nội dung</h1>
      <p className="text-sm text-gray-500 mb-6">
        Nội dung bị model tự động từ chối hoặc người dùng kiến nghị duyệt lại. Duyệt
        để cho phép, hoặc từ chối để khóa vĩnh viễn (không thể kiến nghị lại).
      </p>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Không có nội dung nào cần xử lý.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="bg-white border rounded-xl p-4 flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs uppercase bg-gray-100 px-2 py-0.5 rounded">
                    {item.type === 'lesson' ? 'Bài học' : 'Khóa học'}
                  </span>
                  <span className="font-medium truncate">{item.title}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${MODERATION_COLORS[item.moderationStatus]}`}
                  >
                    {MODERATION_LABELS[item.moderationStatus]}
                  </span>
                  {item.moderationLabel && (
                    <span className="text-xs text-gray-400">nhãn: {item.moderationLabel}</span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="text-xs text-gray-500">
                    {item.type === 'lesson' ? `Khóa học: ${item.subtitle}` : `GV: ${item.subtitle}`}
                    {item.instructor?.email ? ` · ${item.instructor.email}` : ''}
                  </p>
                )}
                {item.moderationReason && (
                  <p className="text-xs text-red-600 mt-1">Lý do từ chối: {item.moderationReason}</p>
                )}
                {item.appealReason && (
                  <p className="text-xs text-amber-700 mt-1">Kiến nghị: {item.appealReason}</p>
                )}
                {item.markdownUrl && (
                  <a
                    href={item.markdownUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                  >
                    Xem nội dung đã trích xuất
                  </a>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => approveMutation.mutate({ type: item.type, id: item.id })}
                  disabled={approveMutation.isPending}
                  className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Duyệt
                </button>
                <button
                  onClick={async () => {
                    const reason = (await showPrompt({ title: 'Lý do từ chối (tùy chọn):' })) ?? undefined;
                    rejectMutation.mutate({ type: item.type, id: item.id, reason });
                  }}
                  disabled={rejectMutation.isPending}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  Từ chối (khóa)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
