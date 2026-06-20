'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { notify } from '@/store/dialog.store';

export default function CourseMessagesPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [congratulationsMessage, setCongratulationsMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  useEffect(() => {
    if (data) {
      setWelcomeMessage(data.welcomeMessage ?? '');
      setCongratulationsMessage(data.congratulationsMessage ?? '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => instructorApi.updateCourse(id, { welcomeMessage, congratulationsMessage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Lưu thất bại'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-2xl font-bold text-ink">Tin nhắn khóa học</h1>
        <p className="mt-1 text-sm text-muted">
          Viết tin nhắn cho học viên (tùy chọn) để khuyến khích họ tương tác. Tin nhắn được tự động gửi khi học viên tham gia hoặc hoàn thành khóa học. Để trống nếu bạn không muốn gửi.
        </p>
      </header>

      <div>
        <label className="block text-sm font-medium mb-2">Tin nhắn chào mừng</label>
        <RichTextEditor value={welcomeMessage} onChange={setWelcomeMessage} placeholder="Lời chào khi học viên bắt đầu khóa học..." />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Tin nhắn chúc mừng</label>
        <RichTextEditor value={congratulationsMessage} onChange={setCongratulationsMessage} placeholder="Lời chúc mừng khi học viên hoàn thành khóa học..." />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded-md bg-sky px-5 py-2 text-sm font-semibold text-white hover:bg-sky-deep disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
        {saved && <span className="text-sm text-leaf">Đã lưu</span>}
      </div>
    </div>
  );
}
