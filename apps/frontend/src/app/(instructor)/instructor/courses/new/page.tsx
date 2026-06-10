'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { courseApi } from '@/lib/api/course.api';
import { useRouter } from 'next/navigation';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Plus, X } from 'lucide-react';

const schema = z.object({
  title: z.string().min(5, 'Tiêu đề ít nhất 5 ký tự'),
  shortDescription: z.string().max(150, 'Tối đa 150 ký tự').optional(),
  description: z.string().min(10, 'Mô tả ít nhất 10 ký tự'),
  categoryId: z.string().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  price: z.number().min(0),
  language: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function DynamicListField({
  label,
  placeholder,
  items,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  error?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setInput('');
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <span className="flex-1 text-gray-800">{item}</span>
            <button type="button" onClick={() => remove(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Thêm
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function NewCoursePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [objectivesError, setObjectivesError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { level: 'beginner', price: 0, language: 'vi' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData & { objectives: string[]; targetAudience: string[]; requirements: string[] }) =>
      instructorApi.createCourse(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      router.push(`/instructor/courses/${res.data.id}/edit`);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi tạo khóa học'),
  });

  const onSubmit = (data: FormData) => {
    if (objectives.length === 0) {
      setObjectivesError('Cần ít nhất 1 mục tiêu học tập');
      return;
    }
    setObjectivesError('');
    createMutation.mutate({ ...data, objectives, targetAudience, requirements });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Tạo khóa học mới</h1>
        <p className="text-sm text-gray-500">Điền thông tin cơ bản trước khi thêm nội dung bài học</p>
      </div>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Thông tin cơ bản</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Tiêu đề khóa học *</label>
            <input
              {...register('title')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ví dụ: NestJS từ A đến Z"
            />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mô tả ngắn</label>
            <input
              {...register('shortDescription')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Tối đa 150 ký tự"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mô tả chi tiết *</label>
            <textarea
              {...register('description')}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Trình độ *</label>
              <select
                {...register('level')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="beginner">Sơ cấp</option>
                <option value="intermediate">Trung cấp</option>
                <option value="advanced">Nâng cao</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Giá (VND) *</label>
              <input
                type="number"
                {...register('price', { valueAsNumber: true })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min={0}
              />
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
            </div>
          </div>
        </div>

        {/* Course Content Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Nội dung khóa học</h2>

          <DynamicListField
            label="Người học sẽ học được gì *"
            placeholder="Ví dụ: Xây dựng REST API với NestJS"
            items={objectives}
            onChange={setObjectives}
            error={objectivesError}
          />

          <DynamicListField
            label="Khóa học này dành cho ai"
            placeholder="Ví dụ: Lập trình viên muốn học backend"
            items={targetAudience}
            onChange={setTargetAudience}
          />

          <DynamicListField
            label="Yêu cầu cần thiết để học khóa học"
            placeholder="Ví dụ: Biết cơ bản về JavaScript"
            items={requirements}
            onChange={setRequirements}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || createMutation.isPending}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {createMutation.isPending ? 'Đang tạo...' : 'Tạo & Tiếp tục →'}
        </button>
      </form>
    </div>
  );
}
