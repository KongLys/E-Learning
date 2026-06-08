'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { userApi } from '@/lib/api/user.api';

const schema = z.object({
  fullName: z.string().min(2, 'Họ tên ít nhất 2 ký tự').max(100, 'Tối đa 100 ký tự'),
  phone: z
    .string()
    .regex(/^(0[3-9]\d{8})?$/, 'Số điện thoại không hợp lệ')
    .optional()
    .or(z.literal('')),
  bio: z.string().max(500, 'Tối đa 500 ký tự').optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialData: { fullName: string; phone?: string; bio?: string };
  onSaved: () => void;
}

export function ProfileForm({ initialData, onSaved }: Props) {
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: initialData.fullName,
      phone: initialData.phone ?? '',
      bio: initialData.bio ?? '',
    },
  });

  async function onSubmit(data: FormData) {
    setApiError('');
    setSuccess(false);
    try {
      await userApi.updateMe({
        fullName: data.fullName,
        phone: data.phone || undefined,
        bio: data.bio || undefined,
      });
      setSuccess(true);
      onSaved();
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? 'Cập nhật thất bại');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Họ và tên *</label>
        <input
          {...register('fullName')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Số điện thoại</label>
        <input
          {...register('phone')}
          placeholder="0912345678"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Giới thiệu bản thân</label>
        <textarea
          {...register('bio')}
          rows={3}
          placeholder="Mô tả ngắn về bạn..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {errors.bio && <p className="text-xs text-red-500 mt-1">{errors.bio.message}</p>}
      </div>

      {apiError && <p className="text-sm text-red-500">{apiError}</p>}
      {success && <p className="text-sm text-green-600">Cập nhật thành công!</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
      </button>
    </form>
  );
}
