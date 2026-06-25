'use client';

import { GoogleLogin } from '@react-oauth/google';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

/**
 * Nút "Đăng nhập với Google". Chỉ hiển thị khi NEXT_PUBLIC_GOOGLE_CLIENT_ID được cấu hình
 * (phải nằm trong <GoogleOAuthProvider> ở Providers). Xác minh ID token ở backend
 * qua POST /auth/google rồi lưu phiên đăng nhập.
 */
export function GoogleLoginButton({
  onError,
}: {
  onError?: (message: string) => void;
}) {
  const { setSession } = useAuthStore();
  const router = useRouter();

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs text-muted">hoặc</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <div className="flex justify-center">
        <GoogleLogin
          text="continue_with"
          onSuccess={async (cred) => {
            if (!cred.credential) {
              onError?.('Không nhận được thông tin từ Google');
              return;
            }
            try {
              const { data } = await authApi.googleLogin(cred.credential);
              setSession(data.user, data.accessToken, data.refreshToken);
              router.push('/');
            } catch (err: any) {
              onError?.(
                err?.response?.data?.message ?? 'Đăng nhập Google thất bại',
              );
            }
          }}
          onError={() => onError?.('Đăng nhập Google thất bại')}
        />
      </div>
    </>
  );
}
