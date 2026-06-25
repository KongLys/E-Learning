'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { userApi } from '@/lib/api/user.api';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';
import { GraduationCap, ChevronRight } from 'lucide-react';

export default function ProfileSettingsPage() {
  const { user, refreshUser } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => userApi.getMe().then((r) => r.data),
  });

  if (isLoading) return <LoadingSpinner />;

  const profile = data ?? user;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl text-ink font-bold mb-8">Cài đặt tài khoản</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Avatar */}
        <div className="md:col-span-1">
          <div className="bg-surface-card border border-hairline rounded-card p-6 flex flex-col items-center gap-2">
            <h2 className="text-base font-semibold mb-2 self-start text-ink">Ảnh đại diện</h2>
            <AvatarUpload
              currentAvatarUrl={user?.avatarUrl}
              fullName={user?.fullName ?? ''}
              onSuccess={refreshUser}
            />
            <p className="text-xs text-ink-subtle text-center mt-1">
              JPEG, PNG hoặc WebP · Tối đa 5MB
            </p>
          </div>
        </div>

        {/* Profile + Password */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Thông tin cá nhân */}
          <div className="bg-surface-card border border-hairline rounded-card p-6">
            <h2 className="text-base font-semibold mb-4 text-ink">Thông tin cá nhân</h2>
            {profile && (
              <ProfileForm
                initialData={{
                  fullName: profile.fullName,
                  phone: profile.phone,
                  bio: profile.bio,
                }}
                onSaved={refreshUser}
              />
            )}
            {/* Email (readonly) */}
            <div className="mt-4 pt-4 border-t border-hairline">
              <label className="block text-sm font-medium mb-1 text-ink-mute">Email</label>
              <p className="text-sm text-ink">{user?.email}</p>
            </div>
          </div>

          {/* Đổi mật khẩu */}
          <div className="bg-surface-card border border-hairline rounded-card p-6">
            <h2 className="text-base font-semibold mb-4 text-ink">Đổi mật khẩu</h2>
            <PasswordChangeForm />
          </div>

          {/* Đăng ký làm giảng viên — chỉ học viên */}
          {user?.role === 'student' && (
            <Link
              href="/settings/become-instructor"
              className="bg-surface-card border border-hairline rounded-card p-6 flex items-center gap-4 hover:border-sky transition-colors group"
            >
              <div className="size-10 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
                <GraduationCap className="text-sky" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-ink">Trở thành giảng viên</h2>
                <p className="text-sm text-ink-subtle">
                  Đăng ký để tạo và bán khóa học của riêng bạn.
                </p>
              </div>
              <ChevronRight className="text-ink-subtle group-hover:text-sky shrink-0" size={20} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
