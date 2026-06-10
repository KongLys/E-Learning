'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DynamicListField } from '@/components/instructor/DynamicListField';

export default function CourseGoalsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [objectives, setObjectives] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  useEffect(() => {
    if (data) {
      setObjectives(data.objectives ?? []);
      setRequirements(data.requirements ?? []);
      setTargetAudience(data.targetAudience ?? []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => instructorApi.updateCourse(id, { objectives, requirements, targetAudience }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Lưu thất bại'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-100 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Học viên mục tiêu</h1>
        <p className="mt-1 text-sm text-gray-500">
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
          className="rounded-md bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
        {saved && <span className="text-sm text-green-600">Đã lưu</span>}
      </div>
    </div>
  );
}
