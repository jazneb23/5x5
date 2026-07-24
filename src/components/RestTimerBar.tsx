import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '../state/useTimer';
import { scheduleCompletionNotification } from '../state/timerEffects';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GO_HOLD_MS = 30_000;

function formatMMSS(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface RestTimerBarProps {
  restTimerEnabled: boolean;
  notificationsEnabled: boolean;
}

export function RestTimerBar({ restTimerEnabled, notificationsEnabled }: RestTimerBarProps) {
  const { endsAt, durationMs, remainingMs, isComplete, addSeconds, reset, skip } = useTimerStore();
  const [showGo, setShowGo] = useState(false);
  const goTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedTenSecondsRef = useRef(false);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const previousEndsAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt != null && endsAt !== previousEndsAtRef.current && notificationsEnabled) {
      scheduleCompletionNotification(endsAt, 'Rest complete. GO.');
    }
    previousEndsAtRef.current = endsAt;
  }, [endsAt, notificationsEnabled]);

  useEffect(() => {
    if (isComplete) {
      setShowGo(true);
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
      goTimeoutRef.current = setTimeout(() => setShowGo(false), GO_HOLD_MS);
      if (liveRegionRef.current) liveRegionRef.current.textContent = 'GO';
    } else {
      setShowGo(false);
      announcedTenSecondsRef.current = false;
    }
    return () => {
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
    };
  }, [isComplete]);

  useEffect(() => {
    if (!isComplete && remainingMs <= 10_000 && remainingMs > 0 && !announcedTenSecondsRef.current) {
      announcedTenSecondsRef.current = true;
      if (liveRegionRef.current) liveRegionRef.current.textContent = '10 seconds remaining';
    }
  }, [remainingMs, isComplete]);

  useEffect(() => {
    if (endsAt != null && liveRegionRef.current) {
      liveRegionRef.current.textContent = 'Rest timer started';
    }
    // Intentionally only reacts to a fresh endsAt (new timer), not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  if (!restTimerEnabled || endsAt == null) return null;

  const underTen = remainingMs <= 10_000 && !isComplete;
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      className={`fixed inset-x-0 bottom-16 z-20 mx-auto flex h-[72px] max-w-app items-center justify-between gap-2 border-t border-iron-700 px-3 transition-colors duration-500 ${
        showGo ? 'bg-signal-dim' : 'bg-iron-900'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div ref={liveRegionRef} aria-live="polite" className="sr-only" />

      <button
        type="button"
        onClick={reset}
        className="flex min-w-0 items-center gap-2 focus:outline-none"
        aria-label="Reset timer to full duration"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 56 56" className={underTen ? 'animate-pulse' : ''}>
            <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="var(--iron-700)" strokeWidth="3" />
            {!showGo && (
              <circle
                cx="28"
                cy="28"
                r={RADIUS}
                fill="none"
                stroke={underTen ? 'var(--chalk-100)' : 'var(--signal)'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dashoffset 250ms linear' }}
              />
            )}
          </svg>
        </span>
        <span className="truncate font-mono text-timer tabular-nums text-chalk-100" style={{ fontSize: 34 }}>
          {showGo ? 'GO' : formatMMSS(remainingMs)}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => addSeconds(-30)}
          disabled={showGo}
          aria-label="Subtract 30 seconds"
          className="flex h-12 w-12 items-center justify-center rounded-sm bg-iron-800 text-label text-chalk-300 disabled:opacity-40"
        >
          -30
        </button>
        <button
          type="button"
          onClick={() => addSeconds(30)}
          disabled={showGo}
          aria-label="Add 30 seconds"
          className="flex h-12 w-12 items-center justify-center rounded-sm bg-iron-800 text-label text-chalk-300 disabled:opacity-40"
        >
          +30
        </button>
        <button
          type="button"
          onClick={skip}
          aria-label="Skip rest"
          className="flex h-12 items-center justify-center px-2 text-label uppercase tracking-[0.12em] text-chalk-500"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
