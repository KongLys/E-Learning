'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
// import { Footer } from '@/components/layout/Footer';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'student' && user.role !== 'instructor') router.replace('/');
  }, [user, hasHydrated, router]);

  if (!hasHydrated) return <LoadingSpinner />;
  if (!user || (user.role !== 'student' && user.role !== 'instructor')) return null;

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      {/* <Footer /> */}
    </>
  );
}
