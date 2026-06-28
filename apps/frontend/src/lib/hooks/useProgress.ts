'use client';

import { useEffect, useRef } from 'react';
import { learnApi } from '@/lib/api/learn.api';

export function useProgress(lessonId: string, getPosition: () => number) {
  const watchRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    watchRef.current = 0;

    intervalRef.current = setInterval(async () => {
      watchRef.current += 15;
      try {
        await learnApi.updateProgress(lessonId, Math.floor(getPosition()), 15);
      } catch { /* ignore progress save errors */ }
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // getPosition đổi mỗi render (đọc vị trí hiện tại); cố ý chỉ reset interval theo lessonId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);
}
