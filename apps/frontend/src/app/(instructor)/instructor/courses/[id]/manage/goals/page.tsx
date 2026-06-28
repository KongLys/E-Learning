'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DynamicListField } from '@/components/instructor/DynamicListField';
import { notify } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';

interface CourseGoals {
  objectives?: string[];
  requirements?: string[];
  targetAudience?: string[];
}

function GoalsForm({ courseId, initial }: { courseId: string; initial: CourseGoals }) {
  const qc = useQueryClient();
  const [objectives, setObjectives] = useState<string[]>(initial.objectives ?? []);
  const [requirements, setRequirements] = useState<string[]>(initial.requirements ?? []);
  const [targetAudience, setTargetAudience] = useState<string[]>(initial.targetAudience ?? []);
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => instructorApi.updateCourse(courseId, { objectives, requirements, targetAudience }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', courseId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Lưu thất bại')),
  });

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-2xl font-bold text-ink">Học viên mục tiêu</h1>
        <p className="mt-1 text-sm text-muted">
          Các mô tả sau sẽ hiển thị công khai trên trang tổng quan khóa học và giúp học viên quyết định khóa học có phù hợp với họ hay không.
        </p>
      </header>

      <DynamicListField
        label="Học viên sẽ học được gì trong khóa học của bạn?"
        hint="Bạn nên nhập ít nhất 4 mục tiêu hoặc kết quả học tập mà học viên có thể mong đợi đạt được."
        placeholder="Ví dụ: Xây dựng REST API với NestJS"
        items={objectives}
        onChange={setObjectives}
      />

      <DynamicListField
        label="Yêu cầu hoặc điều kiện tiên quyết để tham gia khóa học của bạn là gì?"
        hint="Liệt kê các kỹ năng, kinh nghiệm, công cụ hoặc thiết bị mà học viên bắt buộc phải có trước khi tham gia khóa học."
        placeholder="Ví dụ: Biết cơ bản về JavaScript"
        items={requirements}
        onChange={setRequirements}
      />

      <DynamicListField
        label="Khóa học này dành cho đối tượng nào?"
        hint="Viết mô tả rõ ràng về học viên mục tiêu cho khóa học, tức là những người sẽ thấy nội dung khóa học có giá trị."
        placeholder="Ví dụ: Lập trình viên muốn học backend"
        items={targetAudience}
        onChange={setTargetAudience}
      />

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

export default function CourseGoalsPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<CourseGoals>({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  if (isLoading || !data) return <LoadingSpinner />;

  return <GoalsForm courseId={id} initial={data} />;
}
