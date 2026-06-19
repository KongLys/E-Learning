'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '@/lib/api/chat.api';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { UserMenu } from '@/components/layout/UserMenu';
import { MessageSquare, Search } from 'lucide-react';

function ChatLink() {
  const { data: convData } = useQuery({
    queryKey: ['chat-rooms-unread'],
    queryFn: () => chatApi.getConversations(),
    refetchInterval: 30000,
  });

  const conversations = Array.isArray(convData) ? convData : [];
  const unreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  return (
    <Link
      href="/chat"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface-strong transition-colors"
      aria-label="Chat"
      title="Chat"
    >
      <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-semantic-error text-white text-[10px] font-semibold leading-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function NavSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/courses?search=${encodeURIComponent(q)}` : '/courses');
      }}
      className="relative w-full max-w-md"
    >
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none">
        <Search size={16} aria-hidden="true" />
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tìm kiếm khóa học..."
        aria-label="Tìm kiếm khóa học"
        className="w-full rounded-pill border border-hairline-strong bg-surface-card pl-10 pr-4 py-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:border-emphasis transition-colors"
      />
    </form>
  );
}

export function Navbar() {
  const { user } = useAuthStore();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav className="sticky top-0 z-40 h-16 bg-canvas/95 backdrop-blur-sm border-b border-hairline">
      <div className="max-w-300 mx-auto h-full px-6 flex items-center gap-6">
        {/* Left: Logo + Nav links */}
        <Link href="/" className="font-display text-xl text-ink select-none shrink-0">
          ELearn
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href="/courses"
            className={`px-4 py-2 text-[15px] font-medium transition-colors ${isActive('/courses')
              ? 'text-ink border-b-2 border-ink pb-1.5'
              : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
              }`}
          >
            Khám phá
          </Link>
        </div>

        {/* Center: Search */}
        <div className="flex flex-1 justify-center">
          <NavSearch />
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          {user?.role === 'student' && (
            <Link
              href="/my-courses"
              className={`px-4 py-2 text-[15px] font-medium transition-colors ${isActive('/my-courses')
                ? 'text-ink border-b-2 border-ink pb-1.5'
                : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
                }`}
            >
              Khóa học của tôi
            </Link>
          )}
          {user?.role === 'instructor' && (
            <Link
              href="/instructor/dashboard"
              className={`px-4 py-2 text-[15px] font-medium transition-colors ${isActive('/instructor/dashboard') || isActive('/instructor/courses') || isActive('/instructor/questions')
                ? 'text-ink border-b-2 border-ink pb-1.5'
                : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
                }`}
            >
              Giảng dạy
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className={`px-4 py-2 text-[15px] font-medium transition-colors ${isActive('/admin')
                ? 'text-ink border-b-2 border-ink pb-1.5'
                : 'text-muted hover:text-ink rounded-lg hover:bg-surface-strong'
                }`}
            >
              Admin
            </Link>
          )}
          {user ? (
            <>
              {(user.role === 'student' || user.role === 'instructor') && (
                <ChatLink />
              )}
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 text-[15px] font-medium text-muted hover:text-ink transition-colors">
                Đăng nhập
              </Link>
              <Link href="/register" className="inline-flex h-9 items-center px-4 rounded-pill bg-emphasis text-white text-sm font-medium hover:bg-ink transition-colors">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
