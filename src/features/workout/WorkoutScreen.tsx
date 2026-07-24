import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ExerciseLog } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PlateStrip } from '../../components/PlateStrip';
import { SetCircle } from '../../components/SetCircle';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { NumericEntrySheet } from '../../components/NumericEntrySheet';
import { useWakeLock } from '../../state/useWakeLock';

function formatElapsed(startedAt: number): string {
  const totalMinutes = Math.floor((Date.now() - startedAt) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m} min`;
}

export function WorkoutScreen() {
  const navigate = useNavigate();
  const workout = useAppStore((s) => s.currentWorkout);
  const exercises = useAppStore((s) => s.exercises);
  const settings = useAppStore((s) => s.settings);
  const tapSetCircle = useAppStore((s) => s.tapSetCircle);
  const setReps = useAppStore((s) => s.setReps);
  const setExerciseNote = useAppStore((s) => s.setExerciseNote);
  const addExerciseToSession = useAppStore((s) => s.addExerciseToSession);
  const discardWorkout = useAppStore((s) => s.discardWorkout);
  const finishWorkout = useAppStore((s) => s.finishWorkout);

  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedWarmup, setExpandedWarmup] = useState<Record<string, boolean>>({});
  const [expandedNote, setExpandedNote] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [keypad, setKeypad] = useState<{ exerciseId: string; setIndex: number; targetReps: number; value: number } | null>(null);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [, forceElapsedTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceElapsedTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!workout) navigate('/', { replace: true });
  }, [workout, navigate]);

  useWakeLock(Boolean(workout) && settings.keepScreenAwake);

  const isExerciseLogged = (log: ExerciseLog) => log.sets.filter((s) => !s.isWarmup).every((s) => s.completedReps != null);

  const activeLog = workout?.exercises[activeIndex];
  const lastLoggedRef = useMemo(() => activeLog && isExerciseLogged(activeLog), [activeLog]);

  useEffect(() => {
    if (!workout) return;
    if (lastLoggedRef && activeIndex < workout.exercises.length - 1) {
      const timeout = setTimeout(() => setActiveIndex((i) => i + 1), 900);
      return () => clearTimeout(timeout);
    }
  }, [lastLoggedRef, activeIndex, workout]);

  if (!workout) return null;

  const isLastExercise = activeIndex === workout.exercises.length - 1;
  const lastExerciseLog = workout.exercises[workout.exercises.length - 1];
  const workoutFullyLogged = isExerciseLogged(lastExerciseLog);
  const anySetLogged = workout.exercises.some((log) => log.sets.some((s) => s.completedReps != null));

  const availableToAdd = exercises.filter(
    (e) => !e.archived && !workout.exercises.some((log) => log.exerciseId === e.id),
  );

  async function handleFinish() {
    const id = await finishWorkout();
    navigate('/workout/complete', { state: { workoutId: id } });
  }

  async function handleDiscard() {
    await discardWorkout();
    navigate('/', { replace: true });
  }

  return (
    <div>
      <ScreenHeader
        title={`Workout ${workout.type}`}
        showBack={false}
        right={
          <div className="relative">
            <span className="mr-3 font-mono text-data text-chalk-500" aria-hidden="true">
              {formatElapsed(workout.startedAt)}
            </span>
            <button type="button" aria-label="More options" onClick={() => setMenuOpen((v) => !v)} className="text-chalk-100">
              <MoreHorizontal size={22} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-40 w-48 rounded-md border border-iron-700 bg-iron-800 p-1 shadow-lg">
                <button
                  type="button"
                  disabled={!anySetLogged}
                  onClick={() => {
                    setMenuOpen(false);
                    void handleFinish();
                  }}
                  className="block w-full rounded-sm px-3 py-2 text-left text-body text-chalk-100 disabled:opacity-40"
                >
                  Finish workout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDiscard(true);
                  }}
                  className="block w-full rounded-sm px-3 py-2 text-left text-body text-fail"
                >
                  Discard workout
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="px-5 pb-6">
        {workout.exercises.map((log, index) => {
          const exercise = exercises.find((e) => e.id === log.exerciseId);
          if (!exercise) return null;
          const logged = isExerciseLogged(log);
          const isActive = index === activeIndex;
          const passedCount = log.sets.filter((s) => !s.isWarmup && s.completedReps != null && s.completedReps >= s.targetReps).length;
          const totalWorkSets = log.sets.filter((s) => !s.isWarmup).length;

          if (!isActive) {
            return (
              <button
                key={log.exerciseId}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="flex w-full items-center justify-between border-b border-iron-800 py-3.5 text-left"
              >
                <span className={logged ? 'text-body text-chalk-100' : 'text-body text-chalk-500'}>{exercise.name}</span>
                <div className="flex items-center gap-3">
                  <span className={logged ? 'text-data text-chalk-100' : 'text-data text-chalk-500'}>
                    {log.prescribedWeight} {settings.unit.toUpperCase()}
                  </span>
                  {logged && (
                    <div className="flex gap-1">
                      {log.sets
                        .filter((s) => !s.isWarmup)
                        .map((s) => (
                          <span
                            key={s.setIndex}
                            className={`h-2 w-2 rounded-full ${
                              s.completedReps != null && s.completedReps >= s.targetReps ? 'bg-chalk-100' : 'border border-fail'
                            }`}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </button>
            );
          }

          const warmups = log.sets.filter((s) => s.isWarmup);
          const workSets = log.sets.filter((s) => !s.isWarmup);
          const nextExercise = !isLastExercise ? exercises.find((e) => e.id === workout.exercises[index + 1]?.exerciseId) : undefined;
          const nextLog = !isLastExercise ? workout.exercises[index + 1] : undefined;

          return (
            <div key={log.exerciseId} className="rounded-lg border border-iron-700 bg-iron-900 p-5">
              <p className="mb-1 text-label uppercase tracking-[0.12em] text-chalk-500">
                {index + 1} of {workout.exercises.length}
              </p>
              <h2 className="mb-4 text-title text-chalk-100">{exercise.name}</h2>

              <div className="mb-4 text-center">
                <span className="font-display text-weight-hero text-chalk-100">{log.prescribedWeight}</span>
                <span className="ml-2 align-baseline text-label text-chalk-500">{settings.unit.toUpperCase()}</span>
              </div>

              {exercise.kind === 'barbell' && exercise.barWeight != null && (
                <div className="mb-4 flex justify-center">
                  <PlateStrip
                    targetWeight={log.prescribedWeight}
                    barWeight={exercise.barWeight}
                    availablePlates={settings.availablePlates}
                    unit={settings.unit}
                  />
                </div>
              )}

              {warmups.length > 0 && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setExpandedWarmup((prev) => ({ ...prev, [log.exerciseId]: !prev[log.exerciseId] }))}
                    className="text-data text-chalk-500"
                  >
                    {expandedWarmup[log.exerciseId] ? '▾' : '▸'} Warm up ({warmups.length} sets)
                  </button>
                  {expandedWarmup[log.exerciseId] && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {warmups.map((s) => (
                        <div key={s.setIndex} className="flex flex-col items-center gap-2">
                          <SetCircle
                            set={s}
                            index={s.setIndex}
                            onTap={() => tapSetCircle(log.exerciseId, s.setIndex)}
                            onLongPress={(current) =>
                              setKeypad({ exerciseId: log.exerciseId, setIndex: s.setIndex, targetReps: s.targetReps, value: current })
                            }
                          />
                          <span className="text-label text-chalk-500">{s.weight}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="my-4 border-t border-iron-800" />

              <div className="flex flex-wrap justify-center gap-3">
                {workSets.map((s) => (
                  <SetCircle
                    key={s.setIndex}
                    set={s}
                    index={workSets.indexOf(s)}
                    onTap={() => tapSetCircle(log.exerciseId, s.setIndex)}
                    onLongPress={(current) =>
                      setKeypad({ exerciseId: log.exerciseId, setIndex: s.setIndex, targetReps: s.targetReps, value: current })
                    }
                  />
                ))}
              </div>

              <div className="mt-2 text-center text-data text-chalk-500">
                {passedCount}/{totalWorkSets} sets
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setExpandedNote((prev) => ({ ...prev, [log.exerciseId]: !prev[log.exerciseId] }))}
                  className="text-data text-chalk-500"
                >
                  {expandedNote[log.exerciseId] ? '▾' : '▸'} Note
                </button>
                {expandedNote[log.exerciseId] && (
                  <textarea
                    value={log.note ?? ''}
                    onChange={(e) => setExerciseNote(log.exerciseId, e.target.value)}
                    className="mt-2 w-full rounded-sm border border-iron-700 bg-transparent p-2 text-body text-chalk-100"
                    rows={2}
                  />
                )}
              </div>

              <div className="mt-5">
                {isLastExercise && workoutFullyLogged ? (
                  <Button onClick={handleFinish}>Finish workout</Button>
                ) : nextExercise && nextLog ? (
                  <p className="text-center text-data text-chalk-500">
                    Next: {nextExercise.name} {nextLog.prescribedWeight}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="mt-6">
          <Button variant="secondary" onClick={() => setAddExerciseOpen(true)}>
            Add exercise
          </Button>
        </div>
      </div>

      {addExerciseOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setAddExerciseOpen(false)}>
          <div
            className="max-h-[70vh] w-full max-w-app overflow-y-auto rounded-t-lg border border-iron-700 bg-iron-900 p-5"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-title text-chalk-100">Add exercise</h2>
            {availableToAdd.length === 0 ? (
              <p className="text-body text-chalk-500">No other exercises in your library.</p>
            ) : (
              <div className="space-y-1">
                {availableToAdd.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      addExerciseToSession(e.id);
                      setAddExerciseOpen(false);
                    }}
                    className="block w-full rounded-sm px-3 py-3 text-left text-body text-chalk-100 hover:bg-iron-800"
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirmDiscard}
        title="Discard workout?"
        body="Discard this workout? Logged sets will not be saved."
        confirmLabel="Discard workout"
        onConfirm={() => {
          setConfirmDiscard(false);
          void handleDiscard();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      <NumericEntrySheet
        open={keypad != null}
        initialValue={keypad?.value ?? 0}
        label={keypad ? `Reps (target ${keypad.targetReps})` : ''}
        onSubmit={(value) => {
          if (keypad) setReps(keypad.exerciseId, keypad.setIndex, value);
          setKeypad(null);
        }}
        onCancel={() => setKeypad(null)}
      />
    </div>
  );
}
