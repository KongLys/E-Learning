'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';

const schema = z.object({
  fullName: z.string().min(2, 'Họ tên ít nhất 2 ký tự'),
  email: z.email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu ít nhất 8 ký tự')
    .regex(/(?=.*[A-Z])(?=.*\d)/, 'Mật khẩu cần ít nhất 1 chữ hoa và 1 số'),
  role: z.enum(['student', 'instructor']),
});
type FormData = z.infer<typeof schema>;

const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số'),
});
type OtpFormData = z.infer<typeof otpSchema>;

const inputClass =
  'w-full rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-emphasis transition-colors';

const labelClass = 'block text-sm font-medium text-ink mb-1.5';

const RESEND_COOLDOWN = 60;

export default function RegisterPage() {
  const { setSession } = useAuthStore();
  const router = useRouter();
  const [error, setError] = useState('');
  const [step, setStep] = useState<'info' | 'otp'>('info');
  const [info, setInfo] = useState<FormData | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const infoForm = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'student' },
  });

  const otpForm = useForm<OtpFormData>({ resolver: zodResolver(otpSchema) });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onRequestOtp = async (data: FormData) => {
    setError('');
    try {
      await authApi.requestRegisterOtp(data);
      setInfo(data);
      setStep('otp');
      setCooldown(RESEND_COOLDOWN);
      otpForm.reset();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Không gửi được mã xác minh');
    }
  };

  const onVerifyOtp = async (data: OtpFormData) => {
    if (!info) return;
    setError('');
    try {
      const { data: res } = await authApi.verifyRegisterOtp({
        email: info.email,
        code: data.code,
      });
      setSession(res.user, res.accessToken, res.refreshToken);
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Xác minh thất bại');
    }
  };

  const onResend = async () => {
    if (!info || cooldown > 0) return;
    setError('');
    try {
      await authApi.resendRegisterOtp({ email: info.email });
      setCooldown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Không gửi lại được mã');
    }
  };

  const onBack = () => {
    setError('');
    setStep('info');
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl text-ink mb-2">
          {step === 'info' ? 'Đăng ký' : 'Xác minh email'}
        </h1>
        <p className="text-sm text-muted">
          {step === 'info'
            ? 'Tạo tài khoản ELearn miễn phí'
            : `Nhập mã 6 số vừa gửi tới ${info?.email ?? ''}`}
        </p>
      </div>

      <div className="bg-surface-card rounded-card border border-hairline p-8 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        {error && (
          <div className="mb-5 rounded-lg bg-coral-soft border border-coral px-4 py-3 text-sm text-semantic-error">
            {error}
          </div>
        )}

        {step === 'info' ? (
          <form onSubmit={infoForm.handleSubmit(onRequestOtp)} className="space-y-4">
            <div>
              <label className={labelClass}>Họ và tên</label>
              <input
                {...infoForm.register('fullName')}
                className={inputClass}
                placeholder="Nguyễn Văn A"
              />
              {infoForm.formState.errors.fullName && (
                <p className="mt-1.5 text-xs text-semantic-error">
                  {infoForm.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                {...infoForm.register('email')}
                className={inputClass}
                placeholder="email@example.com"
              />
              {infoForm.formState.errors.email && (
                <p className="mt-1.5 text-xs text-semantic-error">
                  {infoForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Mật khẩu</label>
              <input
                type="password"
                {...infoForm.register('password')}
                className={inputClass}
                placeholder="••••••••"
              />
              {infoForm.formState.errors.password && (
                <p className="mt-1.5 text-xs text-semantic-error">
                  {infoForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Vai trò</label>
              <select
                {...infoForm.register('role')}
                className="w-full rounded-lg border border-hairline-strong bg-surface-card px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-emphasis transition-colors"
              >
                <option value="student">Học viên</option>
                <option value="instructor">Giảng viên</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={infoForm.formState.isSubmitting}
                className="w-full inline-flex h-14 items-center justify-center rounded-pill bg-sky text-white text-lg font-semibold hover:bg-sky-deep transition-colors disabled:opacity-50"
              >
                {infoForm.formState.isSubmitting ? 'Đang gửi mã...' : 'Tiếp tục'}
              </button>
            </div>

            <GoogleLoginButton onError={setError} />
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(onVerifyOtp)} className="space-y-4">
            <div>
              <label className={labelClass}>Mã xác minh</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...otpForm.register('code')}
                className={`${inputClass} text-center text-lg tracking-[0.5em]`}
                placeholder="000000"
              />
              {otpForm.formState.errors.code && (
                <p className="mt-1.5 text-xs text-semantic-error">
                  {otpForm.formState.errors.code.message}
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={otpForm.formState.isSubmitting}
                className="w-full inline-flex h-14 items-center justify-center rounded-pill bg-sky text-white text-lg font-semibold hover:bg-sky-deep transition-colors disabled:opacity-50"
              >
                {otpForm.formState.isSubmitting ? 'Đang xác minh...' : 'Tạo tài khoản'}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={onBack}
                className="font-medium text-muted hover:text-ink transition-colors"
              >
                ← Quay lại
              </button>
              <button
                type="button"
                onClick={onResend}
                disabled={cooldown > 0}
                className="font-medium text-ink hover:text-emphasis transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
              </button>
            </div>
          </form>
        )}
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
