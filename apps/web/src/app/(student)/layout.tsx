'use client';

import { useAuthStore } from '@/store/auth.store';
import { useHasHydrated } from '@/lib/hooks/useHasHydrated';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const hasHydrated = useHasHydrated();
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && !user) router.replace('/login');
  }, [user, hasHydrated, router]);

  if (!hasHydrated) return <LoadingSpinner />;
  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
