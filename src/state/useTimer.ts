import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { cancelScheduledNotification, playCompletionTone, vibrateComplete } from './timerEffects';

// Section 8.3: never accumulate setInterval ticks. Store an absolute endsAt
// and recompute remaining time from Date.now() on every tick and on every
// visibilitychange/pageshow. sessionStorage lets a relaunch resume the timer.

const STORAGE_KEY = '5x5-timer-endsAt';

export type TimerKind = 'work' | 'failed' | 'warmup';

interface TimerState {
  endsAt: number | null;
  durationMs: number;
  kind: TimerKind | null;
  remainingMs: number;
  isComplete: boolean;
  start: (durationMs: number, kind: TimerKind) => void;
  addSeconds: (delta: number) => void;
  reset: () => void;
  skip: () => void;
  tick: () => void;
}

function persist(endsAt: number | null, durationMs: number, kind: TimerKind | null) {
  try {
    if (endsAt == null || kind == null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ endsAt, durationMs, kind }));
    }
  } catch {
    // sessionStorage unavailable (e.g. private mode edge cases); timer still
    // works for the current tab via in-memory state.
  }
}

export const useTimerStore = create<TimerState>((set, get) => ({
  endsAt: null,
  durationMs: 0,
  kind: null,
  remainingMs: 0,
  isComplete: false,

  start: (durationMs, kind) => {
    const endsAt = Date.now() + durationMs;
    persist(endsAt, durationMs, kind);
    set({ endsAt, durationMs, kind, remainingMs: durationMs, isComplete: false });
  },

  addSeconds: (delta) => {
    const { endsAt, durationMs, kind } = get();
    if (endsAt == null || kind == null) return;
    const nextEndsAt = Math.max(Date.now(), endsAt + delta * 1000);
    const nextDuration = durationMs + delta * 1000;
    persist(nextEndsAt, nextDuration, kind);
    set({ endsAt: nextEndsAt, durationMs: nextDuration, remainingMs: Math.max(0, nextEndsAt - Date.now()) });
  },

  reset: () => {
    const { durationMs, kind } = get();
    if (kind == null) return;
    const endsAt = Date.now() + durationMs;
    persist(endsAt, durationMs, kind);
    set({ endsAt, remainingMs: durationMs, isComplete: false });
  },

  skip: () => {
    persist(null, 0, null);
    set({ endsAt: null, durationMs: 0, kind: null, remainingMs: 0, isComplete: false });
  },

  tick: () => {
    const { endsAt, isComplete } = get();
    if (endsAt == null) return;
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      if (!isComplete) set({ remainingMs: 0, isComplete: true });
    } else {
      set({ remainingMs: remaining, isComplete: false });
    }
  },
}));

/** Called once from a top-level effect to resume a timer across a relaunch. */
export function resumeTimerFromStorage() {
  const raw = (() => {
    try {
      const item = sessionStorage.getItem(STORAGE_KEY);
      return item ? (JSON.parse(item) as { endsAt: number; durationMs: number; kind: TimerKind }) : null;
    } catch {
      return null;
    }
  })();
  if (!raw) return;
  const remaining = raw.endsAt - Date.now();
  useTimerStore.setState({
    endsAt: raw.endsAt,
    durationMs: raw.durationMs,
    kind: raw.kind,
    remainingMs: Math.max(0, remaining),
    isComplete: remaining <= 0,
  });
}

/**
 * Mount once at the app root. Drives the tick loop on a 250ms interval (a
 * pure repaint trigger, never an accumulator — see tick() above), recomputes
 * immediately on visibilitychange/pageshow, and fires the sound + vibration
 * the instant the timer crosses zero.
 */
export function useTimerEngine(): void {
  const wasCompleteRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => useTimerStore.getState().tick(), 250);
    const recompute = () => useTimerStore.getState().tick();
    document.addEventListener('visibilitychange', recompute);
    window.addEventListener('pageshow', recompute);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', recompute);
      window.removeEventListener('pageshow', recompute);
    };
  }, []);

  useEffect(
    () =>
      useTimerStore.subscribe((state) => {
        if (state.isComplete && !wasCompleteRef.current) {
          wasCompleteRef.current = true;
          playCompletionTone();
          vibrateComplete();
        } else if (!state.isComplete) {
          wasCompleteRef.current = false;
        }
        if (state.endsAt == null) cancelScheduledNotification();
      }),
    [],
  );
}
