'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { userApi } from '@/lib/api/user.api';
import { getApiErrorMessage } from '@/lib/api/error';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: z
      .string()
      .min(8, 'Mật khẩu mới ít nhất 8 ký tự')
      .regex(/[A-Z]/, 'Phải có ít nhất 1 chữ hoa')
      .regex(/\d/, 'Phải có ít nhất 1 chữ số'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky focus:border-sky transition-colors';

export function PasswordChangeForm() {
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setApiError('');
    setSuccess(false);
    try {
      await userApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setSuccess(true);
      reset();
    } catch (err) {
      setApiError(getApiErrorMessage(err, 'Đổi mật khẩu thất bại'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-ink">Mật khẩu hiện tại *</label>
        <input
          type="password"
          {...register('currentPassword')}
          className={inputClass}
        />
        {errors.currentPassword && (
          <p className="text-xs text-semantic-error mt-1">{errors.currentPassword.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-ink">Mật khẩu mới *</label>
        <input
          type="password"
          {...register('newPassword')}
          className={inputClass}
        />
        {errors.newPassword && (
          <p className="text-xs text-semantic-error mt-1">{errors.newPassword.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-ink">Xác nhận mật khẩu mới *</label>
        <input
          type="password"
          {...register('confirmPassword')}
          className={inputClass}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-semantic-error mt-1">{errors.confirmPassword.message}</p>
        )}
      </div>

      {apiError && <p className="text-sm text-semantic-error">{apiError}</p>}
      {success && <p className="text-sm text-semantic-success">Đổi mật khẩu thành công!</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-sky text-white py-2 rounded-lg text-sm font-medium hover:bg-sky-deep disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? 'Đang xử lý...' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}
