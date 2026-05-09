'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

const schema = z.object({
  fullName: z.string().min(2, 'Họ tên ít nhất 2 ký tự'),
  email: z.email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
  role: z.enum(['student', 'instructor']),
});
type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-emphasis transition-colors';

const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function RegisterPage() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'student' },
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await authApi.register(data);
      await login(data.email, data.password);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Đăng ký thất bại');
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl text-ink mb-2">Đăng ký</h1>
        <p className="text-sm text-muted">Tạo tài khoản ELearn miễn phí</p>
      </div>

      <div className="bg-surface-card rounded-2xl border border-hairline p-8 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-semantic-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelClass}>Họ và tên</label>
            <input
              {...register('fullName')}
              className={inputClass}
              placeholder="Nguyễn Văn A"
            />
            {errors.fullName && (
              <p className="mt-1.5 text-xs text-semantic-error">{errors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              {...register('email')}
              className={inputClass}
              placeholder="email@example.com"
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-semantic-error">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Mật khẩu</label>
            <input
              type="password"
              {...register('password')}
              className={inputClass}
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1.5 text-xs text-semantic-error">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Vai trò</label>
            <select
              {...register('role')}
              className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-emphasis transition-colors"
            >
              <option value="student">Học viên</option>
              <option value="instructor">Giảng viên</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex h-11 items-center justify-center rounded-pill bg-emphasis text-white text-[15px] font-medium hover:bg-ink transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Đã có tài khoản?{' '}
        <Link href="/login" className="font-medium text-ink hover:text-emphasis transition-colors">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
