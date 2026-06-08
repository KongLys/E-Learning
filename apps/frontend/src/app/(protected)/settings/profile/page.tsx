'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { userApi } from '@/lib/api/user.api';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

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
      <h1 className="text-2xl font-bold mb-8">Cài đặt tài khoản</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Avatar */}
        <div className="md:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2">
            <h2 className="text-base font-semibold mb-2 self-start">Ảnh đại diện</h2>
            <AvatarUpload
              currentAvatarUrl={user?.avatarUrl}
              fullName={user?.fullName ?? ''}
              onSuccess={refreshUser}
            />
            <p className="text-xs text-gray-400 text-center mt-1">
              JPEG, PNG hoặc WebP · Tối đa 5MB
            </p>
          </div>
        </div>

        {/* Profile + Password */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Thông tin cá nhân */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4">Thông tin cá nhân</h2>
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
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium mb-1 text-gray-500">Email</label>
              <p className="text-sm text-gray-700">{user?.email}</p>
            </div>
          </div>

          {/* Đổi mật khẩu */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4">Đổi mật khẩu</h2>
            <PasswordChangeForm />
          </div>
        </div>
      </div>
    </div>
  );
}
