'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Loader2 } from 'lucide-react';
import { userApi } from '@/lib/api/user.api';

interface Props {
  currentAvatarUrl?: string;
  fullName: string;
  onSuccess: () => void;
}

export function AvatarUpload({ currentAvatarUrl, fullName, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh tối đa 5MB');
      return;
    }
    setError('');
    setUploading(true);
    try {
      await userApi.uploadAvatar(file);
      onSuccess();
    } catch {
      setError('Tải ảnh lên thất bại, vui lòng thử lại');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative group w-24 h-24 rounded-full overflow-hidden cursor-pointer border-2 border-gray-200"
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {currentAvatarUrl ? (
          <Image src={currentAvatarUrl} alt={fullName} fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-700 text-2xl font-semibold">
            {initials}
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading ? (
            <Loader2 className="animate-spin w-6 h-6 text-white" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
      >
        {uploading ? 'Đang tải...' : 'Đổi ảnh đại diện'}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
