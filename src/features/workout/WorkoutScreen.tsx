import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, X } from 'lucide-react';
import type { ExerciseKind, ExerciseLog, ProgressionScheme } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PlateStrip } from '../../components/PlateStrip';
import { SetCircle } from '../../components/SetCircle';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { NumericEntrySheet } from '../../components/NumericEntrySheet';
import { useWakeLock } from '../../state/useWakeLock';

const WARMUP_WINDOW_MS = 5 * 60 * 1000;

function formatElapsed(startedAt: number): string {
  const totalMinutes = Math.floor((Date.now() - startedAt) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m} min`;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isExerciseLogged(log: ExerciseLog): boolean {
  return log.sets.filter((s) => !s.isWarmup).every((s) => s.completedReps != null);
}

type EntrySheetState =
  | { kind: 'reps'; exerciseId: string; setIndex: number; targetReps: number; value: number }
  | { kind: 'weight'; exerciseId: string; value: number }
  | { kind: 'warmupWeight'; exerciseId: string; setIndex: number; value: number };

interface NewExerciseDraft {
  name: string;
  kind: ExerciseKind;
  defaultSets: number;
  defaultReps: number;
  startingWeight: number;
  increment: number;
  progression: ProgressionScheme;
}

function defaultNewExerciseDraft(barWeight: number): NewExerciseDraft {
  return { name: '', kind: 'barbell', defaultSets: 5, defaultReps: 5, startingWeight: barWeight, increment: 5, progression: 'linear' };
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
  const setExercisePrescribedWeight = useAppStore((s) => s.setExercisePrescribedWeight);
  const setSetWeight = useAppStore((s) => s.setSetWeight);
  const discardWorkout = useAppStore((s) => s.discardWorkout);
  const finishWorkout = useAppStore((s) => s.finishWorkout);
  const createExercise = useAppStore((s) => s.createExercise);
  const lastFailureByExercise = useAppStore((s) => s.lastFailureByExercise);

  const [activeIndex, setActiveIndex] = useState(() => {
    if (!workout) return 0;
    const idx = workout.exercises.findIndex((log) => !isExerciseLogged(log));
    return idx === -1 ? workout.exercises.length - 1 : idx;
  });
  const [expandedWarmup, setExpandedWarmup] = useState<Record<string, boolean>>({});
  const [expandedNote, setExpandedNote] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [entrySheet, setEntrySheet] = useState<EntrySheetState | null>(null);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [addExerciseMode, setAddExerciseMode] = useState<'pick' | 'create'>('pick');
  const [newExerciseDraft, setNewExerciseDraft] = useState<NewExerciseDraft>(() => defaultNewExerciseDraft(settings.barWeight));
  const [dismissedFailureNotice, setDismissedFailureNotice] = useState<Record<string, boolean>>({});
  const [warmupBannerEndsAt, setWarmupBannerEndsAt] = useState<Record<string, number>>({});
  const [dismissedWarmupBanner, setDismissedWarmupBanner] = useState<Record<string, boolean>>({});
  const [, forceElapsedTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceElapsedTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Drives the warm-up window countdown display; only matters while a banner
  // is actually showing, but a plain 1s tick is simpler than gating it.
  const [, forceSecondTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceSecondTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!workout) navigate('/', { replace: true });
  }, [workout, navigate]);

  useWakeLock(Boolean(workout) && settings.keepScreenAwake);

  // A 5-minute warm-up window starts the first time an exercise with warmup
  // sets becomes active and isn't finished yet. It keeps counting down in
  // real time even if the user navigates elsewhere and back; it never blocks
  // logging sets or editing warmup weights.
  useEffect(() => {
    if (!workout) return;
    const activeLog = workout.exercises[activeIndex];
    if (!activeLog) return;
    if (isExerciseLogged(activeLog) || !activeLog.sets.some((s) => s.isWarmup)) return;
    setWarmupBannerEndsAt((prev) =>
      prev[activeLog.exerciseId] != null ? prev : { ...prev, [activeLog.exerciseId]: Date.now() + WARMUP_WINDOW_MS },
    );
  }, [workout, activeIndex]);

  // Auto-advance fires once, only on the moment an exercise's sets go from
  // incomplete to complete while it is the active one. Navigating back to an
  // already-completed exercise must not re-trigger it — see workout screen
  // navigation requirement.
  //
  // The pending advance is tracked in a ref, not a per-render effect cleanup:
  // correcting a failed set takes several taps (e.g. 5 -> 4 -> 3), and every
  // tap replaces the `workout` object. An effect-cleanup-based timeout would
  // get cancelled by each of those incidental re-runs and never fire.
  const wasLoggedRef = useRef<Record<string, boolean>>({});
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workout) return;
    const activeLog = workout.exercises[activeIndex];
    if (!activeLog) return;
    const nowLogged = isExerciseLogged(activeLog);
    const prevLogged = wasLoggedRef.current[activeLog.exerciseId] ?? false;
    wasLoggedRef.current[activeLog.exerciseId] = nowLogged;

    if (!nowLogged) {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
      return;
    }

    if (!prevLogged && activeIndex < workout.exercises.length - 1) {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = setTimeout(() => setActiveIndex((i) => i + 1), 900);
    }
  }, [workout, activeIndex]);

  useEffect(
    () => () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    },
    [],
  );

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

  function closeAddExercise() {
    setAddExerciseOpen(false);
    setAddExerciseMode('pick');
    setNewExerciseDraft(defaultNewExerciseDraft(settings.barWeight));
  }

  async function handleCreateExercise() {
    if (!newExerciseDraft.name.trim()) return;
    const created = await createExercise({
      name: newExerciseDraft.name.trim(),
      kind: newExerciseDraft.kind,
      defaultSets: newExerciseDraft.defaultSets,
      defaultReps: newExerciseDraft.defaultReps,
      startingWeight: newExerciseDraft.startingWeight,
      increment: newExerciseDraft.increment,
      progression: newExerciseDraft.progression,
      barWeight: newExerciseDraft.kind === 'barbell' ? settings.barWeight : null,
      assignment: 'none',
    });
    await addExerciseToSession(created.id);
    closeAddExercise();
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

          const failures = lastFailureByExercise[log.exerciseId];
          const showFailureNotice = failures != null && failures.length > 0 && !dismissedFailureNotice[log.exerciseId];

          const bannerEndsAt = warmupBannerEndsAt[log.exerciseId];
          const warmupRemainingMs = bannerEndsAt != null ? bannerEndsAt - Date.now() : 0;
          const showWarmupBanner = bannerEndsAt != null && warmupRemainingMs > 0 && !dismissedWarmupBanner[log.exerciseId];

          return (
            <div key={log.exerciseId} className="rounded-lg border border-iron-700 bg-iron-900 p-5">
              <p className="mb-1 text-label uppercase tracking-[0.12em] text-chalk-500">
                {index + 1} of {workout.exercises.length}
              </p>
              <h2 className="mb-4 text-title text-chalk-100">{exercise.name}</h2>

              {showFailureNotice && (
                <div className="mb-4 flex items-start justify-between gap-2 rounded-sm border border-fail/40 bg-fail/10 px-3 py-2">
                  <p className="text-body text-fail">
                    Failed last time — {failures.map((f) => `Set ${f.setIndex + 1}: ${f.completedReps}/${f.targetReps}`).join(', ')}
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss failure notice"
                    onClick={() => setDismissedFailureNotice((prev) => ({ ...prev, [log.exerciseId]: true }))}
                    className="shrink-0 text-fail"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {showWarmupBanner && (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-sm border border-iron-700 bg-iron-800 px-3 py-2">
                  <p className="text-body text-chalk-300">Warm-up window: {formatCountdown(warmupRemainingMs)}</p>
                  <button
                    type="button"
                    aria-label="Dismiss warm-up window"
                    onClick={() => setDismissedWarmupBanner((prev) => ({ ...prev, [log.exerciseId]: true }))}
                    className="shrink-0 text-chalk-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="mb-2 text-center">
                <span className="font-display text-weight-hero text-chalk-100">{log.prescribedWeight}</span>
                <span className="ml-2 align-baseline text-label text-chalk-500">{settings.unit.toUpperCase()}</span>
              </div>

              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setEntrySheet({ kind: 'weight', exerciseId: log.exerciseId, value: log.prescribedWeight })}
                  className="flex items-center gap-1 text-label uppercase tracking-[0.12em] text-chalk-500"
                >
                  <Pencil size={12} aria-hidden="true" />
                  Edit weight
                </button>
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
                    <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${warmups.length}, minmax(0, 1fr))` }}>
                      {warmups.map((s) => (
                        <div key={s.setIndex} className="flex flex-col items-center gap-2">
                          <SetCircle
                            set={s}
                            index={s.setIndex}
                            onTap={() => tapSetCircle(log.exerciseId, s.setIndex)}
                            onLongPress={(current) =>
                              setEntrySheet({ kind: 'reps', exerciseId: log.exerciseId, setIndex: s.setIndex, targetReps: s.targetReps, value: current })
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEntrySheet({ kind: 'warmupWeight', exerciseId: log.exerciseId, setIndex: s.setIndex, value: s.weight })
                            }
                            className="text-label text-chalk-500 underline decoration-dotted underline-offset-2"
                          >
                            {s.weight}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="my-4 border-t border-iron-800" />

              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${workSets.length}, minmax(0, 1fr))` }}>
                {workSets.map((s) => (
                  <div key={s.setIndex} className="flex justify-center">
                    <SetCircle
                      set={s}
                      index={workSets.indexOf(s)}
                      onTap={() => tapSetCircle(log.exerciseId, s.setIndex)}
                      onLongPress={(current) =>
                        setEntrySheet({ kind: 'reps', exerciseId: log.exerciseId, setIndex: s.setIndex, targetReps: s.targetReps, value: current })
                      }
                    />
                  </div>
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={closeAddExercise}>
          <div
            className="max-h-[70vh] w-full max-w-app overflow-y-auto rounded-t-lg border border-iron-700 bg-iron-900 p-5"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {addExerciseMode === 'pick' ? (
              <>
                <h2 className="mb-4 text-title text-chalk-100">Add exercise</h2>
                <div className="space-y-1">
                  {availableToAdd.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        void addExerciseToSession(e.id);
                        closeAddExercise();
                      }}
                      className="block w-full rounded-sm px-3 py-3 text-left text-body text-chalk-100 hover:bg-iron-800"
                    >
                      {e.name}
                    </button>
                  ))}
                  {availableToAdd.length === 0 && <p className="py-2 text-body text-chalk-500">No other exercises in your library.</p>}
                </div>
                <div className="mt-3 border-t border-iron-800 pt-3">
                  <Button variant="secondary" onClick={() => setAddExerciseMode('create')}>
                    Create new exercise
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-4 text-title text-chalk-100">Create exercise</h2>
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Name</span>
                    <input
                      autoFocus
                      value={newExerciseDraft.name}
                      onChange={(e) => setNewExerciseDraft((d) => ({ ...d, name: e.target.value }))}
                      className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 text-body text-chalk-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Kind</span>
                    <select
                      value={newExerciseDraft.kind}
                      onChange={(e) => setNewExerciseDraft((d) => ({ ...d, kind: e.target.value as ExerciseKind }))}
                      className="w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100"
                    >
                      <option value="barbell">Barbell</option>
                      <option value="dumbbell">Dumbbell</option>
                      <option value="bodyweight">Bodyweight</option>
                      <option value="machine">Machine</option>
                      <option value="timed">Timed</option>
                      <option value="distance">Distance</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Sets</span>
                      <input
                        type="number"
                        value={newExerciseDraft.defaultSets}
                        onChange={(e) => setNewExerciseDraft((d) => ({ ...d, defaultSets: Number(e.target.value) }))}
                        className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Reps</span>
                      <input
                        type="number"
                        value={newExerciseDraft.defaultReps}
                        onChange={(e) => setNewExerciseDraft((d) => ({ ...d, defaultReps: Number(e.target.value) }))}
                        className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Starting weight</span>
                      <input
                        type="number"
                        value={newExerciseDraft.startingWeight}
                        onChange={(e) => setNewExerciseDraft((d) => ({ ...d, startingWeight: Number(e.target.value) }))}
                        className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Increment</span>
                      <input
                        type="number"
                        value={newExerciseDraft.increment}
                        onChange={(e) => setNewExerciseDraft((d) => ({ ...d, increment: Number(e.target.value) }))}
                        className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">Progression</span>
                    <select
                      value={newExerciseDraft.progression}
                      onChange={(e) => setNewExerciseDraft((d) => ({ ...d, progression: e.target.value as ProgressionScheme }))}
                      className="w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100"
                    >
                      <option value="linear">Linear (auto progression)</option>
                      <option value="manual">Manual (you set the weight)</option>
                      <option value="none">None (no weight tracked)</option>
                    </select>
                  </label>

                  <Button onClick={() => void handleCreateExercise()} disabled={!newExerciseDraft.name.trim()}>
                    Create and add to workout
                  </Button>
                  <Button variant="ghost" onClick={() => setAddExerciseMode('pick')}>
                    Back
                  </Button>
                </div>
              </>
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
        open={entrySheet != null}
        initialValue={entrySheet?.value ?? 0}
        label={
          entrySheet?.kind === 'reps'
            ? `Reps (target ${entrySheet.targetReps})`
            : entrySheet?.kind === 'weight'
              ? `Weight (${settings.unit.toUpperCase()})`
              : entrySheet?.kind === 'warmupWeight'
                ? `Warmup weight (${settings.unit.toUpperCase()})`
                : ''
        }
        onSubmit={(value) => {
          if (entrySheet?.kind === 'reps') setReps(entrySheet.exerciseId, entrySheet.setIndex, value);
          else if (entrySheet?.kind === 'weight') setExercisePrescribedWeight(entrySheet.exerciseId, value);
          else if (entrySheet?.kind === 'warmupWeight') setSetWeight(entrySheet.exerciseId, entrySheet.setIndex, value);
          setEntrySheet(null);
        }}
        onCancel={() => setEntrySheet(null)}
      />
    </div>
  );
}
