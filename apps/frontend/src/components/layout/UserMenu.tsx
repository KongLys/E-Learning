'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ChevronDown } from 'lucide-react';

export function UserMenu() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (!user) return null;

  const initials = user.fullName?.split(' ').map((w) => w[0]).slice(-2).join('').toUpperCase() ?? '?';

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push('/');
  };

  // Open on hover; a short close delay keeps the menu open while the cursor
  // travels from the avatar into the dropdown.
  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        aria-label="Tài khoản"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-8 w-8 rounded-full overflow-hidden bg-surface-strong flex items-center justify-center ring-1 ring-hairline-strong">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.fullName} width={32} height={32} className="object-cover" />
          ) : (
            <span className="text-xs font-semibold text-muted">{initials}</span>
          )}
        </div>
        <ChevronDown size={14} />
      </button>

      {open && (
        // pt-2 acts as an invisible bridge so the menu stays open while the
        // cursor crosses the gap between the avatar and the dropdown.
        <div className="absolute right-0 top-full pt-2 w-52 z-50">
          <div className="bg-surface-card border border-hairline rounded-2xl shadow-lg overflow-hidden py-1">
            <div className="px-4 py-3 border-b border-hairline">
              <p className="text-sm font-medium text-ink truncate">{user.fullName}</p>
              <p className="text-xs text-muted truncate">{user.email}</p>
            </div>
            <div className="py-1">
              <Link href="/settings/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                Cài đặt tài khoản
              </Link>
            </div>
            <div className="py-1">
              {user.role === 'student' && (
                <Link href="/my-courses" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                  Khóa học của tôi
                </Link>
              )}
              {user.role === 'instructor' && (
                <Link href="/instructor/dashboard" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                  Trang giảng viên
                </Link>
              )}
              {user.role === 'admin' && (
                <Link href="/admin" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                  Admin
                </Link>
              )}
            </div>
            <div className="border-t border-hairline py-1">
              <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-muted hover:text-ink hover:bg-canvas transition-colors">
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
