import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Workout } from '../../domain/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface HistoryCalendarViewProps {
  workouts: Workout[]; // completed only
  onSelectWorkout: (id: string) => void;
}

export function HistoryCalendarView({ workouts, onSelectWorkout }: HistoryCalendarViewProps) {
  const initialMonth = useMemo(() => {
    const mostRecent = workouts[0]?.completedAt;
    const base = mostRecent != null ? new Date(mostRecent) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [workouts]);

  const [cursor, setCursor] = useState(initialMonth);
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, Workout>();
    for (const w of workouts) {
      if (w.completedAt == null) continue;
      const key = dateKey(w.completedAt);
      // Most recent wins if two workouts somehow land on the same day.
      if (!map.has(key) || (map.get(key)?.completedAt ?? 0) < w.completedAt) map.set(key, w);
    }
    return map;
  }, [workouts]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function goToMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1));
  }

  const isCurrentRealMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month" className="p-2 text-chalk-300">
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-title text-chalk-100">{MONTH_FORMATTER.format(cursor)}</span>
          {!isCurrentRealMonth && (
            <button
              type="button"
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="text-data text-signal"
            >
              Today
            </button>
          )}
        </div>
        <button type="button" onClick={() => goToMonth(1)} aria-label="Next month" className="p-2 text-chalk-300">
          <ChevronRight size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="text-label uppercase tracking-[0.12em] text-chalk-500">
            {label}
          </span>
        ))}

        {cells.map((day, i) => {
          if (day == null) return <div key={`blank-${i}`} />;
          const key = `${year}-${month}-${day}`;
          const workout = byDay.get(key);
          const isToday = isCurrentRealMonth && day === today.getDate();
          const allSucceeded = workout ? workout.exercises.every((e) => e.succeeded) : false;

          return (
            <button
              key={key}
              type="button"
              disabled={!workout}
              onClick={() => workout && onSelectWorkout(workout.id)}
              className="flex flex-col items-center gap-1 py-1.5"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-data ${
                  isToday ? 'border border-iron-600 text-chalk-100' : workout ? 'text-chalk-100' : 'text-chalk-500'
                }`}
              >
                {day}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  !workout ? 'bg-transparent' : allSucceeded ? 'bg-chalk-100' : 'border border-fail'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
