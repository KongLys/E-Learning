'use client';

import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/auth.store';

/**
 * Trả về true sau khi store zustand (persist) đã hydrate xong từ localStorage.
 * Dùng useSyncExternalStore để subscribe trực tiếp vào API hydration của persist,
 * tránh gọi setState đồng bộ trong useEffect.
 */
export function useHasHydrated() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const persist = useAuthStore.persist;
      if (!persist) return () => {};
      return persist.onFinishHydration(onStoreChange);
    },
    () => useAuthStore.persist?.hasHydrated() ?? true,
    () => false,
  );
}
