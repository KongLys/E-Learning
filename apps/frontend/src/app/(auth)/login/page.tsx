'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { getApiErrorMessage } from '@/lib/api/error';

const schema = z.object({
  email: z.email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
});
type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-emphasis transition-colors';

const labelClass = 'block text-sm font-medium text-ink mb-1.5';

export default function LoginPage() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await login(data.email, data.password);
      router.push('/');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Đăng nhập thất bại'));
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl text-ink mb-2">Đăng nhập</h1>
        <p className="text-sm text-muted">Chào mừng trở lại ELearn</p>
      </div>

      <div className="bg-surface-card rounded-card border border-hairline p-8 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        {error && (
          <div className="mb-5 rounded-lg bg-coral-soft border border-coral px-4 py-3 text-sm text-semantic-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex h-14 items-center justify-center rounded-pill bg-sky text-white text-lg font-semibold hover:bg-sky-deep transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </div>
        </form>

        <GoogleLoginButton onError={setError} />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="font-medium text-ink hover:text-emphasis transition-colors">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
