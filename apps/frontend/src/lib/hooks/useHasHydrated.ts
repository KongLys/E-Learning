'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';

export function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const persist = useAuthStore.persist;
    if (!persist) {
      setHasHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => setHasHydrated(true));
    return unsub;
  }, []);

  return hasHydrated;
}
