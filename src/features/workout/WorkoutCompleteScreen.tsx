import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import * as repo from '../../data/repository';
import { useAppStore } from '../../state/useAppStore';
import { Button } from '../../components/Button';

function formatDuration(startedAt: number, completedAt: number): string {
  const minutes = Math.round((completedAt - startedAt) / 60000);
  return `${minutes} min`;
}

export function WorkoutCompleteScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const workoutId = (location.state as { workoutId?: string } | null)?.workoutId;
  const summary = useAppStore((s) => s.lastCompletionSummary);

  const workout = useLiveQuery(async () => {
    if (workoutId) return repo.getWorkout(workoutId);
    const all = await repo.getAllWorkouts();
    return all.find((w) => w.completedAt != null);
  }, [workoutId]);

  const [bodyweight, setBodyweight] = useState('');
  const [note, setNote] = useState('');

  if (!workout || workout.completedAt == null || !summary) {
    return (
      <div className="px-5 py-6">
        <p className="text-body text-chalk-500">No completed workout to show.</p>
        <div className="mt-4">
          <Button onClick={() => navigate('/')}>Back to Today</Button>
        </div>
      </div>
    );
  }

  const records = summary.filter((s) => s.isPR);

  async function handleDone() {
    const parsedWeight = bodyweight.trim() ? Number(bodyweight) : null;
    await repo.saveWorkout({ ...workout!, bodyweight: parsedWeight, note: note.trim() || null });
    navigate('/', { replace: true });
  }

  return (
    <div className="px-5 py-6">
      <h1 className="mb-1 font-display text-display-md text-chalk-100">Workout {workout.type}</h1>
      <p className="mb-6 text-data text-chalk-500">{formatDuration(workout.startedAt, workout.completedAt)}</p>

      <div className="space-y-5">
        {summary.map((item) => {
          const log = workout.exercises.find((e) => e.exerciseId === item.exerciseId);
          const workSets = log?.sets.filter((s) => !s.isWarmup) ?? [];
          return (
            <div key={item.exerciseId}>
              <div className="flex items-center justify-between">
                <span className="text-body-strong text-chalk-100">{item.name}</span>
                <span className="font-mono text-data text-chalk-100">{item.weight}</span>
                <div className="flex gap-1.5 font-mono text-data">
                  {workSets.map((s) => (
                    <span key={s.setIndex} className={s.completedReps != null && s.completedReps >= s.targetReps ? 'text-chalk-100' : 'text-fail'}>
                      {s.completedReps ?? 0}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-data">
                <span className="text-label uppercase tracking-[0.12em] text-chalk-500">Next time</span>
                {item.isManualOrNone ? (
                  <span className="text-chalk-500">Manual</span>
                ) : item.isDeload ? (
                  <span className="text-fail">
                    Deloaded {item.weight} → {item.nextWeight}
                  </span>
                ) : item.succeeded ? (
                  <span className="text-chalk-100">
                    {item.weight} → {item.nextWeight}
                  </span>
                ) : (
                  <span className="text-chalk-500">
                    {item.nextWeight} stays. Attempt {(item.attempt ?? 0) + 1} of {item.failuresBeforeDeload}.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {records.length > 0 && (
        <div className="mt-6 space-y-1">
          {records.map((r) => (
            <p key={r.exerciseId} className="text-body-strong text-record">
              ★ Record. {r.name} {r.weight}.
            </p>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Bodyweight</span>
          <input
            type="number"
            inputMode="decimal"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
            placeholder="Optional"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 text-body text-chalk-100"
            rows={2}
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="mt-8">
        <Button onClick={handleDone}>Done</Button>
      </div>
    </div>
  );
}
