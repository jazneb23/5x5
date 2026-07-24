import { useRef } from 'react';
import type { SetLog } from '../domain/types';

interface SetCircleProps {
  set: SetLog;
  index: number;
  onTap: () => void;
  onLongPress: (currentReps: number) => void;
}

const LONG_PRESS_MS = 400;

export function SetCircle({ set, index, onTap, onLongPress }: SetCircleProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongPress = useRef(false);

  const isUnlogged = set.completedReps == null;
  const isComplete = set.completedReps != null && set.completedReps >= set.targetReps;
  const isPartial = set.completedReps != null && set.completedReps > 0 && set.completedReps < set.targetReps;
  const isZero = set.completedReps === 0;

  let stateClass = 'border-2 border-iron-700 bg-transparent text-chalk-500';
  let content: string | number = set.targetReps;

  if (set.isWarmup && (isComplete || isPartial || isZero)) {
    stateClass = 'bg-iron-700 border-none text-chalk-300';
    content = set.completedReps ?? 0;
  } else if (isComplete) {
    stateClass = 'bg-chalk-100 border-none text-iron-950';
    content = set.targetReps;
  } else if (isPartial) {
    stateClass = 'border-2 border-fail bg-transparent text-fail font-semibold';
    content = set.completedReps ?? 0;
  } else if (isZero) {
    stateClass = 'border-2 border-fail bg-transparent text-fail font-semibold';
    content = 0;
  } else if (isUnlogged) {
    content = set.targetReps;
  }

  const label = `Set ${index + 1}, ${set.completedReps ?? 0} of ${set.targetReps} reps, ${
    isComplete ? 'completed' : isUnlogged ? 'not yet logged' : 'incomplete'
  }`;

  function handlePointerDown() {
    firedLongPress.current = false;
    timerRef.current = setTimeout(() => {
      firedLongPress.current = true;
      if ('vibrate' in navigator) navigator.vibrate(15);
      onLongPress(set.completedReps ?? 0);
    }, LONG_PRESS_MS);
  }

  function clearPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handlePointerUp() {
    clearPress();
    if (!firedLongPress.current) onTap();
  }

  return (
    <button
      type="button"
      role="button"
      aria-label={label}
      className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-iron-950 rounded-full"
      style={{ width: 68, height: 68 }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={clearPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className={`flex items-center justify-center rounded-full font-mono text-data transition-[background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.92] ${stateClass}`}
        style={{ width: 60, height: 60 }}
      >
        {content}
      </span>
    </button>
  );
}
