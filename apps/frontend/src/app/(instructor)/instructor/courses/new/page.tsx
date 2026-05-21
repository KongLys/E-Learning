'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { useRouter } from 'next/navigation';
import { ErrorMessage } from '@/components/common/ErrorMessage';

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

export default function NewCoursePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { level: 'beginner', price: 0, language: 'vi' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => instructorApi.createCourse(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
      router.push(`/instructor/courses/${res.data.id}/edit`);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Lỗi tạo khóa học'),
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Tạo khóa học mới</h1>

      {error && <ErrorMessage message={error} />}

      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Tiêu đề khóa học *</label>
          <input {...register('title')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ví dụ: NestJS từ A đến Z" />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mô tả ngắn</label>
          <input {...register('shortDescription')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Tối đa 150 ký tự" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mô tả chi tiết *</label>
          <textarea {...register('description')} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Trình độ *</label>
            <select {...register('level')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="beginner">Sơ cấp</option>
              <option value="intermediate">Trung cấp</option>
              <option value="advanced">Nâng cao</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Giá (VND) *</label>
            <input type="number" {...register('price', { valueAsNumber: true })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min={0} />
            {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || createMutation.isPending}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Đang tạo...' : 'Tạo & Tiếp tục →'}
        </button>
      </form>
    </div>
  );
}
