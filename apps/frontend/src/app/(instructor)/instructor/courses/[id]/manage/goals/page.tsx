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
  recommendedWeeks?: number | null;
  recommendedHoursPerWeek?: number | null;
}

function GoalsForm({ courseId, initial }: { courseId: string; initial: CourseGoals }) {
  const qc = useQueryClient();
  const [objectives, setObjectives] = useState<string[]>(initial.objectives ?? []);
  const [requirements, setRequirements] = useState<string[]>(initial.requirements ?? []);
  const [targetAudience, setTargetAudience] = useState<string[]>(initial.targetAudience ?? []);
  const [recommendedWeeks, setRecommendedWeeks] = useState<string>(
    initial.recommendedWeeks != null ? String(initial.recommendedWeeks) : '',
  );
  const [recommendedHoursPerWeek, setRecommendedHoursPerWeek] = useState<string>(
    initial.recommendedHoursPerWeek != null ? String(initial.recommendedHoursPerWeek) : '',
  );
  const [saved, setSaved] = useState(false);

  const weeksNum = Number(recommendedWeeks);
  const hoursNum = Number(recommendedHoursPerWeek);
  const totalHours =
    recommendedWeeks && recommendedHoursPerWeek && weeksNum > 0 && hoursNum > 0
      ? weeksNum * hoursNum
      : null;

  const saveMutation = useMutation({
    mutationFn: () =>
      instructorApi.updateCourse(courseId, {
        objectives,
        requirements,
        targetAudience,
        recommendedWeeks: recommendedWeeks ? weeksNum : null,
        recommendedHoursPerWeek: recommendedHoursPerWeek ? hoursNum : null,
      }),
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

      <div className="border-t border-hairline pt-6">
        <h2 className="text-lg font-semibold text-ink">Thời lượng học đề xuất</h2>
        <p className="mt-1 text-sm text-muted">
          Lộ trình học gợi ý cho học viên. Hệ thống dùng thông tin này để tự động nhắc nhở qua email những học viên đang học chậm hơn tiến độ đề xuất.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-ink">Số tuần đề xuất</span>
            <input
              type="number"
              min={1}
              value={recommendedWeeks}
              onChange={(e) => setRecommendedWeeks(e.target.value)}
              placeholder="Ví dụ: 10"
              className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Số giờ học mỗi tuần</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={recommendedHoursPerWeek}
              onChange={(e) => setRecommendedHoursPerWeek(e.target.value)}
              placeholder="Ví dụ: 10"
              className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
            />
          </label>
        </div>
        {totalHours != null && (
          <p className="mt-3 text-sm text-muted">
            Tổng thời gian học đề xuất: <strong className="text-ink">{totalHours} giờ</strong>
          </p>
        )}
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

export default function CourseGoalsPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<CourseGoals>({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  if (isLoading || !data) return <LoadingSpinner />;

  return <GoalsForm courseId={id} initial={data} />;
}
