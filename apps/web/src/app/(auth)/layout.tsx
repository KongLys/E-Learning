'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && user) router.replace('/');
  }, [user, hasHydrated, router]);

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="h-16 flex items-center px-6 border-b border-hairline">
        <Link href="/" className="font-display text-xl text-ink">
          ELearn
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  );
}
