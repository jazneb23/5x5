import { useEffect, useRef } from 'react';

/**
 * Section 8.5: while a workout is in progress and keepScreenAwake is true,
 * hold a screen wake lock. The lock is released automatically by the
 * browser when the page is hidden, so it must be reacquired on
 * visibilitychange, and released explicitly when `active` goes false.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Wake lock can be refused (e.g. low battery); the app still works
        // without it, just with a risk of the screen sleeping mid-workout.
      }
    }

    void acquire();

    function handleVisibility() {
      if (document.visibilityState === 'visible') void acquire();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [active]);
}
