import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import * as repo from '../../data/repository';
import type { Workout } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';

export function HistoryDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exercises = useAppStore((s) => s.exercises);
  const editHistoricalWorkout = useAppStore((s) => s.editHistoricalWorkout);
  const deleteHistoricalWorkout = useAppStore((s) => s.deleteHistoricalWorkout);

  const workout = useLiveQuery(() => (id ? repo.getWorkout(id) : undefined), [id]);
  const [draft, setDraft] = useState<Workout | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const current = draft ?? workout;
  const dirty = draft != null;

  if (!workout) {
    return (
      <div>
        <ScreenHeader title="History" showBack />
        <p className="px-5 text-body text-chalk-500">Workout not found.</p>
      </div>
    );
  }

  function updateReps(exerciseId: string, setIndex: number, reps: number) {
    const base = draft ?? workout;
    if (!base) return;
    const next: Workout = {
      ...base,
      exercises: base.exercises.map((log) =>
        log.exerciseId === exerciseId
          ? { ...log, sets: log.sets.map((s) => (s.setIndex === setIndex ? { ...s, completedReps: reps } : s)) }
          : log,
      ),
    };
    setDraft(next);
  }

  async function handleSave() {
    if (!draft) return;
    await editHistoricalWorkout(draft);
    setConfirmSave(false);
    setDraft(null);
  }

  async function handleDelete() {
    if (!id) return;
    await deleteHistoricalWorkout(id);
    setConfirmDelete(false);
    navigate('/history', { replace: true });
  }

  return (
    <div>
      <ScreenHeader title={`Workout ${workout.type}`} showBack />
      <div className="px-5 pb-6">
        <p className="mb-4 text-data text-chalk-500">{new Date(workout.startedAt).toLocaleString()}</p>

        <div className="space-y-6">
          {current!.exercises.map((log) => {
            const exercise = exercises.find((e) => e.id === log.exerciseId);
            return (
              <div key={log.exerciseId}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-body-strong text-chalk-100">{exercise?.name ?? log.exerciseId}</span>
                  <span className="font-mono text-data text-chalk-500">{log.prescribedWeight}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {log.sets
                    .filter((s) => !s.isWarmup)
                    .map((s) => (
                      <input
                        key={s.setIndex}
                        type="number"
                        inputMode="numeric"
                        value={s.completedReps ?? ''}
                        onChange={(e) => updateReps(log.exerciseId, s.setIndex, Number(e.target.value))}
                        className="h-12 w-12 rounded-sm border border-iron-700 bg-transparent text-center font-mono text-data text-chalk-100"
                      />
                    ))}
                </div>
                {log.note && <p className="mt-2 text-data text-chalk-500">{log.note}</p>}
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-3">
          {dirty && <Button onClick={() => setConfirmSave(true)}>Save changes</Button>}
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete workout
          </Button>
        </div>
      </div>

      <ConfirmSheet
        open={confirmSave}
        title="Recompute progression?"
        body="Editing this workout recomputes every weight for every session after it. This cannot be undone."
        confirmLabel="Save and recompute"
        destructive={false}
        onConfirm={handleSave}
        onCancel={() => setConfirmSave(false)}
      />
      <ConfirmSheet
        open={confirmDelete}
        title="Delete this workout?"
        body="Deleting this workout recomputes every weight for every session after it. This cannot be undone."
        confirmLabel="Delete workout"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
