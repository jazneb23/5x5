import { create } from 'zustand';
import type {
  Exercise,
  ExerciseKind,
  ExerciseState,
  ProgressionScheme,
  Settings,
  SetLog,
  Unit,
  Workout,
  WorkoutAssignment,
  WorkoutType,
} from '../domain/types';
import {
  buildCoreExercises,
  buildVolumeSquatExercise,
  CORE_EXERCISE_IDS,
  nextWorkoutType,
  volumeSquatWeightFor,
  WORKOUT_TEMPLATES,
  warmupFloor,
  workSetRepTargets,
  workSetWeights,
  VOLUME_SQUAT_LOAD_SCHEME,
  type ExperienceLevel,
} from '../domain/program';
import { applyProgression, exerciseSucceeded, failedWorkSets, recomputeExerciseStates, warmupWeightsFromLog, type FailedSetInfo } from '../domain/progression';
import { generateWarmupSets } from '../domain/warmup';
import { canResumeWorkout } from '../domain/resume';
import { allTimeBest } from '../domain/prs';
import { convertAndRoundWeight, STANDARD_BAR_WEIGHT, STANDARD_PLATES } from '../domain/units';
import * as repo from '../data/repository';
import { useTimerStore } from './useTimer';

interface CompletionSummaryItem {
  exerciseId: string;
  name: string;
  succeeded: boolean;
  weight: number;
  nextWeight: number;
  isDeload: boolean;
  isManualOrNone: boolean;
  attempt: number | null; // consecutive failure attempt number, when unchanged and not deloaded
  failuresBeforeDeload: number;
  isPR: boolean;
  skipped: boolean;
  skipReason: string | null;
}

interface AppState {
  initialized: boolean;
  settings: Settings;
  exercises: Exercise[];
  exerciseStates: Record<string, ExerciseState>;
  currentWorkout: Workout | null;
  lastCompletionSummary: CompletionSummaryItem[] | null;
  lastTimerTrigger: { exerciseId: string; setIndex: number } | null;
  // The exercise's most recent prior attempt, when it failed — surfaced as a
  // dismissable heads-up on the workout screen. Absent/empty means either no
  // prior attempt or the last one succeeded.
  lastFailureByExercise: Record<string, FailedSetInfo[]>;

  init: () => Promise<void>;
  completeOnboarding: (experience: ExperienceLevel, unit: Unit, weightOverrides?: Record<string, number>) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  switchUnit: (newUnit: Unit) => Promise<void>;

  nextWorkoutTypeForNewSession: () => Promise<WorkoutType>;
  startWorkout: (type: WorkoutType) => Promise<void>;
  resumeWorkout: (workoutId: string) => Promise<void>;
  tapSetCircle: (exerciseId: string, setIndex: number) => void;
  setReps: (exerciseId: string, setIndex: number, reps: number) => void;
  setExerciseNote: (exerciseId: string, note: string) => void;
  setBodyweight: (bodyweight: number | null) => void;
  setWorkoutNote: (note: string | null) => void;
  addExerciseToSession: (exerciseId: string) => Promise<void>;
  setExercisePrescribedWeight: (exerciseId: string, weight: number) => void;
  setSetWeight: (exerciseId: string, setIndex: number, weight: number) => void;
  skipExercise: (exerciseId: string, reason: string) => void;
  unskipExercise: (exerciseId: string) => void;
  finishWorkout: () => Promise<string>;
  discardWorkout: () => Promise<void>;

  recomputeProgressionFromHistory: () => Promise<void>;
  editHistoricalWorkout: (workout: Workout) => Promise<void>;
  deleteHistoricalWorkout: (id: string) => Promise<void>;

  createExercise: (input: NewExerciseInput) => Promise<Exercise>;
  updateExercise: (exercise: Exercise) => Promise<void>;
  archiveExercise: (id: string) => Promise<void>;
  restoreExercise: (id: string) => Promise<void>;
  setExerciseCurrentWeight: (exerciseId: string, weight: number) => Promise<void>;
}

export interface NewExerciseInput {
  name: string;
  kind: ExerciseKind;
  defaultSets: number;
  defaultReps: number;
  repScheme?: number[] | null;
  startingWeight: number;
  increment: number;
  progression: ProgressionScheme;
  barWeight: number | null;
  assignment: WorkoutAssignment;
}

function now(): number {
  return Date.now();
}

function getExerciseStateOrDefault(
  exerciseId: string,
  exercise: Exercise,
  states: Record<string, ExerciseState>,
): ExerciseState {
  return (
    states[exerciseId] ?? {
      exerciseId,
      currentWeight: exercise.startingWeight,
      consecutiveFailures: 0,
      updatedAt: 0,
      lastWarmupWeights: null,
    }
  );
}

function buildSetsForExercise(
  exercise: Exercise,
  prescribedWeight: number,
  settings: Settings,
  rememberedWarmupWeights: number[] | null,
): SetLog[] {
  const sets: SetLog[] = [];
  let index = 0;

  // `prescribedWeight` is the top work set. A ramped exercise brings the
  // earlier sets in under it; a flat one repeats it.
  const workWeights = workSetWeights(exercise, prescribedWeight, settings.availablePlates);

  if (settings.showWarmupSets && exercise.kind === 'barbell' && exercise.barWeight != null) {
    const floor = warmupFloor(exercise.id, settings.unit);
    // Warm up to the *first* work set, not the top one. Under a ramp the top
    // set is two sets away and the work sets in between are the rest of the
    // ramp — warming up all the way to the top would overshoot the set the
    // lifter is about to do.
    const warmups = generateWarmupSets(workWeights[0] ?? prescribedWeight, exercise.barWeight, floor, settings.availablePlates);
    // Reuse last session's actual warmup weights when the ramp shape still
    // matches (same set count); otherwise fall back to the fresh formula
    // recommendation — see domain/warmup.ts section 7.
    const remembered =
      rememberedWarmupWeights != null && rememberedWarmupWeights.length === warmups.length ? rememberedWarmupWeights : null;
    for (let i = 0; i < warmups.length; i++) {
      const w = warmups[i];
      sets.push({
        setIndex: index++,
        targetReps: w.targetReps,
        completedReps: null,
        weight: remembered ? remembered[i] : w.weight,
        isWarmup: true,
        loggedAt: null,
      });
    }
  }

  // One work set per rep target, each at its own weight — for most exercises
  // that is the same number repeated, for the volume squat it ramps up as the
  // reps come down (12/10/8/8 at 85/90/95/100 percent).
  const repTargets = workSetRepTargets(exercise);
  for (let i = 0; i < repTargets.length; i++) {
    sets.push({
      setIndex: index++,
      targetReps: repTargets[i],
      completedReps: null,
      weight: workWeights[i] ?? prescribedWeight,
      isWarmup: false,
      loggedAt: null,
    });
  }

  return sets;
}

function restDurationFor(kind: 'warmup' | 'set', succeeded: boolean, settings: Settings): number {
  if (kind === 'warmup') return settings.restSecondsWarmup;
  return succeeded ? settings.restSeconds : settings.restSecondsAfterFailedSet;
}

/** `workoutsMostRecentFirst` must already be completed-only, sorted newest first. */
function lastFailureForExercise(exerciseId: string, workoutsMostRecentFirst: Workout[]): FailedSetInfo[] {
  for (const w of workoutsMostRecentFirst) {
    const log = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!log) continue;
    return log.succeeded === false ? failedWorkSets(log) : [];
  }
  return [];
}

/**
 * The failure notices to show for a session's exercises, read from completed
 * history. A session that is currently in progress — including one that was
 * reopened — is not completed, so it never reports a failure against itself.
 */
async function loadLastFailures(exerciseIds: string[]): Promise<Record<string, FailedSetInfo[]>> {
  const priorWorkouts = await repo.getAllWorkouts();
  const completedMostRecentFirst = priorWorkouts
    .filter((w) => w.completedAt != null)
    .sort((a, b) => (b.completedAt as number) - (a.completedAt as number));

  const byExercise: Record<string, FailedSetInfo[]> = {};
  for (const exerciseId of exerciseIds) {
    const failures = lastFailureForExercise(exerciseId, completedMostRecentFirst);
    if (failures.length > 0) byExercise[exerciseId] = failures;
  }
  return byExercise;
}

/**
 * The volume squat's sets were flat when it was introduced and ramp now. A row
 * written in that window has the right reps and no `loadScheme`, so give it
 * one. Its tracked weight is already the top of the ramp — that is what a flat
 * prescription at weight W means — so nothing about the weight itself changes;
 * only the lighter sets underneath appear.
 *
 * Left alone if the rep scheme has been edited to a different set count, since
 * the stock four-entry ramp would not line up with it.
 */
async function backfillVolumeSquatLoadScheme(exercises: Exercise[], volumeSquat: Exercise): Promise<Exercise[]> {
  if (volumeSquat.loadScheme != null) return exercises;
  if (workSetRepTargets(volumeSquat).length !== VOLUME_SQUAT_LOAD_SCHEME.length) return exercises;

  const updated: Exercise = { ...volumeSquat, loadScheme: [...VOLUME_SQUAT_LOAD_SCHEME] };
  await repo.upsertExercise(updated);
  return exercises.map((e) => (e.id === updated.id ? updated : e));
}

/**
 * Workout A squats for volume now (12/10/8/8) instead of the heavy 5x5, which
 * stayed on Workout B. Accounts seeded before that split have no volume squat,
 * so build one the first time we load them, starting from a percentage of the
 * heavy squat's current weight rather than from the bar. Runs once; afterwards
 * the two squats progress independently.
 *
 * Mutates `exerciseStates` in place — the caller is mid-`init` and has not
 * published it to the store yet.
 */
async function ensureVolumeSquat(
  exercises: Exercise[],
  exerciseStates: Record<string, ExerciseState>,
  settings: Settings,
): Promise<Exercise[]> {
  const existing = exercises.find((e) => e.id === CORE_EXERCISE_IDS.squatVolume);
  if (existing) return backfillVolumeSquatLoadScheme(exercises, existing);
  // No heavy squat means nothing has been seeded at all; onboarding builds the
  // full core set including the volume squat.
  const heavySquat = exercises.find((e) => e.id === CORE_EXERCISE_IDS.squat);
  if (!heavySquat) return exercises;

  const heavyWeight = exerciseStates[heavySquat.id]?.currentWeight ?? heavySquat.startingWeight;
  const barWeight = heavySquat.barWeight ?? settings.barWeight;
  const startingWeight = volumeSquatWeightFor(heavyWeight, barWeight, settings.availablePlates);
  const volumeSquat: Exercise = {
    ...buildVolumeSquatExercise(settings.unit, barWeight, startingWeight),
    createdAt: now(),
  };
  const volumeSquatState: ExerciseState = {
    exerciseId: volumeSquat.id,
    currentWeight: startingWeight,
    consecutiveFailures: 0,
    updatedAt: now(),
    lastWarmupWeights: null,
  };

  await repo.upsertExercise(volumeSquat);
  await repo.upsertExerciseState(volumeSquatState);
  exerciseStates[volumeSquat.id] = volumeSquatState;
  return [...exercises, volumeSquat];
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  settings: repo.DEFAULT_SETTINGS,
  exercises: [],
  exerciseStates: {},
  currentWorkout: null,
  lastCompletionSummary: null,
  lastTimerTrigger: null,
  lastFailureByExercise: {},

  init: async () => {
    const [settings, storedExercises, states, currentWorkout] = await Promise.all([
      repo.getSettings(),
      repo.getAllExercises(),
      repo.getAllExerciseStates(),
      repo.getInProgressWorkout(),
    ]);
    const exerciseStates: Record<string, ExerciseState> = {};
    for (const s of states) exerciseStates[s.exerciseId] = s;

    const exercises = await ensureVolumeSquat(storedExercises, exerciseStates, settings);

    set({ settings, exercises, exerciseStates, currentWorkout: currentWorkout ?? null, initialized: true });
  },

  completeOnboarding: async (experience, unit, weightOverrides) => {
    const barWeight = unit === 'lb' ? 45 : 20;
    const availablePlates = unit === 'lb' ? [45, 35, 25, 10, 5, 2.5] : [20, 15, 10, 5, 2.5, 1.25];
    const core = buildCoreExercises(unit, experience, barWeight).map((e) => ({
      ...e,
      createdAt: now(),
      startingWeight: weightOverrides?.[e.id] ?? e.startingWeight,
    }));
    const settings: Settings = { ...repo.DEFAULT_SETTINGS, unit, barWeight, availablePlates, onboardingComplete: true };
    const states: Record<string, ExerciseState> = {};
    for (const e of core)
      states[e.id] = { exerciseId: e.id, currentWeight: e.startingWeight, consecutiveFailures: 0, updatedAt: now(), lastWarmupWeights: null };

    await Promise.all([
      ...core.map((e) => repo.upsertExercise(e)),
      ...Object.values(states).map((s) => repo.upsertExerciseState(s)),
      repo.saveSettings(settings),
    ]);
    set({ exercises: core, settings, exerciseStates: states });
  },

  updateSettings: async (patch) => {
    const settings = { ...get().settings, ...patch };
    await repo.saveSettings(settings);
    set({ settings });
  },

  switchUnit: async (newUnit) => {
    const { settings } = get();
    if (newUnit === settings.unit) return;
    const fromUnit = settings.unit;
    const convert = (weight: number) => convertAndRoundWeight(weight, fromUnit, newUnit);
    const newSettings: Settings = {
      ...settings,
      unit: newUnit,
      barWeight: STANDARD_BAR_WEIGHT[newUnit],
      availablePlates: STANDARD_PLATES[newUnit],
    };
    await repo.convertAllWeights(convert, newSettings);
    await get().init();
  },

  nextWorkoutTypeForNewSession: async () => {
    const workouts = await repo.getAllWorkouts();
    const lastCompleted = workouts.find((w) => w.completedAt != null);
    return nextWorkoutType(lastCompleted?.type === 'custom' ? null : (lastCompleted?.type as WorkoutType | undefined));
  },

  startWorkout: async (type) => {
    const { exercises, exerciseStates, settings } = get();
    const coreIds = WORKOUT_TEMPLATES[type];
    const coreExercises = coreIds.map((id) => exercises.find((e) => e.id === id)).filter((e): e is Exercise => Boolean(e));
    const customExercises = exercises
      .filter((e) => !e.isCore && !e.archived && (e.assignment === type || e.assignment === 'both'))
      .sort((a, b) => a.order - b.order);

    const ordered = [...coreExercises, ...customExercises];

    const lastFailureByExercise = await loadLastFailures(ordered.map((e) => e.id));

    const workout: Workout = {
      id: crypto.randomUUID(),
      type,
      startedAt: now(),
      completedAt: null,
      bodyweight: null,
      note: null,
      exercises: ordered.map((exercise, order) => {
        const state = getExerciseStateOrDefault(exercise.id, exercise, exerciseStates);
        const prescribedWeight = state.currentWeight;
        return {
          exerciseId: exercise.id,
          order,
          prescribedWeight,
          sets: buildSetsForExercise(exercise, prescribedWeight, settings, state.lastWarmupWeights),
          succeeded: null,
          note: null,
          skipped: false,
        };
      }),
    };

    await repo.saveWorkout(workout);
    set({ currentWorkout: workout, lastCompletionSummary: null, lastFailureByExercise });
  },

  /**
   * Reopens a session that was already finished so work missed that day can
   * still be logged against it — the user finished with an exercise skipped
   * or never logged, and comes back to do it.
   *
   * The session goes back to in-progress, and progression is replayed from
   * the remaining completed history, which rolls every exercise back to the
   * weight it was prescribed before that session. Any failure or increment
   * this session produced is undone; finishing it again applies the outcome
   * of what was actually logged, at the original completion time.
   */
  resumeWorkout: async (workoutId) => {
    if (get().currentWorkout) return;
    const [workout, allWorkouts] = await Promise.all([repo.getWorkout(workoutId), repo.getAllWorkouts()]);
    if (!workout || !canResumeWorkout(workout, allWorkouts)) return;

    const reopened: Workout = {
      ...workout,
      completedAt: null,
      resumedAt: now(),
      // A session reopened more than once keeps the completion time it had
      // the first time, so the date never walks forward.
      completedAtBeforeResume: workout.completedAtBeforeResume ?? workout.completedAt,
      // Success is decided at completion. It is recomputed when this session
      // is finished again.
      exercises: workout.exercises.map((log) => ({ ...log, succeeded: null })),
    };
    await repo.saveWorkout(reopened);
    await get().recomputeProgressionFromHistory();

    const lastFailureByExercise = await loadLastFailures(reopened.exercises.map((log) => log.exerciseId));

    set({
      currentWorkout: reopened,
      lastCompletionSummary: null,
      lastTimerTrigger: null,
      lastFailureByExercise,
    });
  },

  tapSetCircle: (exerciseId, setIndex) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const { settings, exercises } = get();

    let triggeredTimer: { exerciseId: string; setIndex: number } | null = null;
    let cancelledTimer = false;

    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) => {
      if (i !== exerciseIndex) return log;
      const setIdx = log.sets.findIndex((s) => s.setIndex === setIndex);
      if (setIdx === -1) return log;
      const s = log.sets[setIdx];

      let nextReps: number | null;
      if (s.completedReps == null) {
        nextReps = s.targetReps;
      } else if (s.completedReps > 0) {
        nextReps = s.completedReps - 1;
      } else {
        nextReps = null;
      }

      const isLastSetOfSession =
        exerciseIndex === workout.exercises.length - 1 && setIdx === log.sets.length - 1;

      if (nextReps == null) {
        if (get().lastTimerTrigger?.exerciseId === exerciseId && get().lastTimerTrigger?.setIndex === setIndex) {
          cancelledTimer = true;
        }
      } else if (!isLastSetOfSession) {
        triggeredTimer = { exerciseId, setIndex };
      }

      const newSets = [...log.sets];
      newSets[setIdx] = { ...s, completedReps: nextReps, loggedAt: nextReps == null ? null : now() };
      return { ...log, sets: newSets };
    });

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);

    if (cancelledTimer) {
      useTimerStore.getState().skip();
      set({ lastTimerTrigger: null });
    } else if (triggeredTimer) {
      const log = updatedExercises[exerciseIndex];
      const s = log.sets.find((set_) => set_.setIndex === setIndex)!;
      const exercise = exercises.find((e) => e.id === exerciseId);
      const kind = s.isWarmup ? 'warmup' : s.completedReps! >= s.targetReps ? 'work' : 'failed';
      const duration = restDurationFor(s.isWarmup ? 'warmup' : 'set', (s.completedReps ?? 0) >= s.targetReps, settings);
      if (settings.restTimerEnabled) {
        useTimerStore.getState().start(duration * 1000, kind);
        set({ lastTimerTrigger: triggeredTimer });
      }
      void exercise; // exercise reserved for future per-exercise timer overrides
    }
  },

  setReps: (exerciseId, setIndex, reps) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const { settings } = get();
    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) => {
      if (i !== exerciseIndex) return log;
      const setIdx = log.sets.findIndex((s) => s.setIndex === setIndex);
      if (setIdx === -1) return log;
      const s = log.sets[setIdx];
      const newSets = [...log.sets];
      newSets[setIdx] = { ...s, completedReps: reps, loggedAt: now() };
      return { ...log, sets: newSets };
    });

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout, lastTimerTrigger: { exerciseId, setIndex } });
    void repo.saveWorkout(nextWorkout);

    const log = updatedExercises[exerciseIndex];
    const isLastSetOfSession = exerciseIndex === workout.exercises.length - 1 && log.sets[log.sets.length - 1].setIndex === setIndex;
    if (settings.restTimerEnabled && !isLastSetOfSession) {
      const s = log.sets.find((set_) => set_.setIndex === setIndex)!;
      const kind = s.isWarmup ? 'warmup' : reps >= s.targetReps ? 'work' : 'failed';
      const duration = restDurationFor(s.isWarmup ? 'warmup' : 'set', reps >= s.targetReps, settings);
      useTimerStore.getState().start(duration * 1000, kind);
    }
  },

  setExerciseNote: (exerciseId, note) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const nextWorkout = {
      ...workout,
      exercises: workout.exercises.map((log) => (log.exerciseId === exerciseId ? { ...log, note } : log)),
    };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  setBodyweight: (bodyweight) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const nextWorkout = { ...workout, bodyweight };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  setWorkoutNote: (note) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const nextWorkout = { ...workout, note };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  addExerciseToSession: async (exerciseId) => {
    const workout = get().currentWorkout;
    const { exercises, exerciseStates, settings } = get();
    if (!workout) return;
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    if (workout.exercises.some((e) => e.exerciseId === exerciseId)) return;

    const state = getExerciseStateOrDefault(exerciseId, exercise, exerciseStates);
    const prescribedWeight = state.currentWeight;
    const nextWorkout: Workout = {
      ...workout,
      exercises: [
        ...workout.exercises,
        {
          exerciseId,
          order: workout.exercises.length,
          prescribedWeight,
          sets: buildSetsForExercise(exercise, prescribedWeight, settings, state.lastWarmupWeights),
          succeeded: null,
          note: null,
          skipped: false,
        },
      ],
    };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);

    const priorWorkouts = await repo.getAllWorkouts();
    const completedMostRecentFirst = priorWorkouts
      .filter((w) => w.completedAt != null)
      .sort((a, b) => (b.completedAt as number) - (a.completedAt as number));
    const failures = lastFailureForExercise(exerciseId, completedMostRecentFirst);
    if (failures.length > 0) {
      set((s) => ({ lastFailureByExercise: { ...s.lastFailureByExercise, [exerciseId]: failures } }));
    }
  },

  setExercisePrescribedWeight: (exerciseId, weight) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const { exercises, settings } = get();
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) => {
      if (i !== exerciseIndex) return log;

      const oldWarmups = log.sets.filter((s) => s.isWarmup);
      const oldWorkSets = log.sets.filter((s) => !s.isWarmup);

      // The edited number is the top work set. Re-derive the whole ramp from
      // it so the lighter sets move with it instead of being left behind at
      // fractions of the old weight.
      const workWeights = workSetWeights(exercise, weight, settings.availablePlates);

      let newWarmups = oldWarmups;
      if (exercise.kind === 'barbell' && exercise.barWeight != null && oldWarmups.length > 0) {
        const floor = warmupFloor(exercise.id, settings.unit);
        const recommended = generateWarmupSets(workWeights[0] ?? weight, exercise.barWeight, floor, settings.availablePlates);
        const loggedCount = oldWarmups.filter((s) => s.completedReps != null).length;
        const kept = oldWarmups.slice(0, loggedCount);
        const rest = recommended.slice(loggedCount).map((w, i2) => ({
          setIndex: loggedCount + i2,
          targetReps: w.targetReps,
          completedReps: null,
          weight: w.weight,
          isWarmup: true,
          loggedAt: null,
        }));
        newWarmups = [...kept, ...rest];
      }

      // Sets already logged keep the weight they were actually done at.
      const newWorkSets = oldWorkSets.map((s, i2) => ({
        ...s,
        setIndex: newWarmups.length + i2,
        weight: s.completedReps != null ? s.weight : workWeights[i2] ?? weight,
      }));

      return { ...log, prescribedWeight: weight, sets: [...newWarmups, ...newWorkSets] };
    });

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  setSetWeight: (exerciseId, setIndex, weight) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) => {
      if (i !== exerciseIndex) return log;
      const setIdx = log.sets.findIndex((s) => s.setIndex === setIndex);
      if (setIdx === -1) return log;
      const newSets = [...log.sets];
      newSets[setIdx] = { ...newSets[setIdx], weight };
      return { ...log, sets: newSets };
    });

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  skipExercise: (exerciseId, reason) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) => {
      if (i !== exerciseIndex) return log;
      return {
        ...log,
        skipped: true,
        note: reason.trim() || null,
        // Any partial logging for today doesn't count once skipped.
        sets: log.sets.map((s) => ({ ...s, completedReps: null, loggedAt: null })),
      };
    });

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  unskipExercise: (exerciseId) => {
    const workout = get().currentWorkout;
    if (!workout) return;
    const exerciseIndex = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (exerciseIndex === -1) return;

    const updatedExercises = workout.exercises.map((log, i) =>
      i === exerciseIndex ? { ...log, skipped: false, note: null } : log,
    );

    const nextWorkout = { ...workout, exercises: updatedExercises };
    set({ currentWorkout: nextWorkout });
    void repo.saveWorkout(nextWorkout);
  },

  finishWorkout: async () => {
    const workout = get().currentWorkout;
    if (!workout) throw new Error('No workout in progress');
    const { exercises, exerciseStates, settings } = get();
    // A reopened session keeps the completion time it had before: it is the
    // same session, so it holds its place in history and in the
    // chronological progression replay rather than jumping to today.
    const completedAt = workout.completedAtBeforeResume ?? now();

    const priorWorkouts = await repo.getAllWorkouts();

    const summary: CompletionSummaryItem[] = [];
    const nextStates: Record<string, ExerciseState> = { ...exerciseStates };
    const finishedExercises = workout.exercises.map((log) => {
      const exercise = exercises.find((e) => e.id === log.exerciseId);
      if (!exercise) return log;
      const priorState = getExerciseStateOrDefault(exercise.id, exercise, exerciseStates);

      // A skipped exercise is neither a success nor a failure: it never
      // reaches applyProgression, and next session's weight is untouched.
      if (log.skipped) {
        summary.push({
          exerciseId: exercise.id,
          name: exercise.name,
          succeeded: false,
          weight: log.prescribedWeight,
          nextWeight: priorState.currentWeight,
          isDeload: false,
          isManualOrNone: exercise.progression !== 'linear',
          attempt: null,
          failuresBeforeDeload: exercise.failuresBeforeDeload,
          isPR: false,
          skipped: true,
          skipReason: log.note,
        });
        return { ...log, succeeded: null };
      }

      const succeeded = exerciseSucceeded(log);
      const result = applyProgression(exercise, priorState, succeeded, settings.availablePlates, completedAt);
      nextStates[exercise.id] = {
        ...result.state,
        lastWarmupWeights: warmupWeightsFromLog(log, priorState.lastWarmupWeights),
      };

      if (result.deload) {
        void repo.recordDeloadEvent({
          exerciseId: exercise.id,
          workoutId: workout.id,
          at: completedAt,
          fromWeight: result.deload.fromWeight,
          toWeight: result.deload.toWeight,
        });
      }

      const previousBest = allTimeBest(priorWorkouts, exercise.id)?.weight ?? -Infinity;
      summary.push({
        exerciseId: exercise.id,
        name: exercise.name,
        succeeded,
        weight: log.prescribedWeight,
        nextWeight: result.state.currentWeight,
        isDeload: Boolean(result.deload),
        isManualOrNone: exercise.progression !== 'linear',
        attempt: !succeeded && !result.deload && exercise.progression === 'linear' ? result.state.consecutiveFailures : null,
        failuresBeforeDeload: exercise.failuresBeforeDeload,
        isPR: succeeded && log.prescribedWeight > previousBest,
        skipped: false,
        skipReason: null,
      });

      return { ...log, succeeded };
    });

    const finishedWorkout: Workout = {
      ...workout,
      exercises: finishedExercises,
      completedAt,
      resumedAt: null,
      completedAtBeforeResume: null,
    };
    await repo.saveWorkout(finishedWorkout);
    await Promise.all(Object.values(nextStates).map((s) => repo.upsertExerciseState(s)));

    set({
      currentWorkout: null,
      exerciseStates: nextStates,
      lastCompletionSummary: summary,
      lastTimerTrigger: null,
      lastFailureByExercise: {},
    });
    useTimerStore.getState().skip();
    return workout.id;
  },

  discardWorkout: async () => {
    const workout = get().currentWorkout;
    if (!workout) return;
    await repo.deleteWorkout(workout.id);
    set({ currentWorkout: null, lastTimerTrigger: null, lastFailureByExercise: {} });
    useTimerStore.getState().skip();
  },

  recomputeProgressionFromHistory: async () => {
    const { settings } = get();
    const [exercises, allWorkouts] = await Promise.all([repo.getAllExercises(), repo.getAllWorkouts()]);
    const completedChronological = allWorkouts
      .filter((w) => w.completedAt != null)
      .sort((a, b) => (a.completedAt as number) - (b.completedAt as number));

    const { states, deloadEvents } = recomputeExerciseStates(exercises, completedChronological, settings.availablePlates);

    await repo.replaceExerciseStatesAndDeloads(Object.values(states), deloadEvents);
    set({ exerciseStates: states });
  },

  editHistoricalWorkout: async (workout) => {
    const withRecomputedSuccess: Workout = {
      ...workout,
      exercises: workout.exercises.map((log) => ({ ...log, succeeded: log.skipped ? null : exerciseSucceeded(log) })),
    };
    await repo.saveWorkout(withRecomputedSuccess);
    await get().recomputeProgressionFromHistory();
  },

  deleteHistoricalWorkout: async (id) => {
    await repo.deleteWorkout(id);
    await get().recomputeProgressionFromHistory();
  },

  createExercise: async (input) => {
    const existing = get().exercises;
    const sameWorkoutCount = existing.filter((e) => !e.isCore && (e.assignment === input.assignment || e.assignment === 'both')).length;
    const exercise: Exercise = {
      id: crypto.randomUUID(),
      name: input.name,
      kind: input.kind,
      isCore: false,
      defaultSets: input.defaultSets,
      defaultReps: input.defaultReps,
      repScheme: input.repScheme ?? null,
      // Custom exercises are flat. The load ramp is the volume squat's alone,
      // and there is no UI to author one.
      loadScheme: null,
      increment: input.increment,
      progression: input.progression,
      startingWeight: input.startingWeight,
      barWeight: input.barWeight,
      failuresBeforeDeload: 3,
      deloadPercent: 0.1,
      archived: false,
      createdAt: now(),
      assignment: input.assignment,
      order: sameWorkoutCount,
    };
    const initialState: ExerciseState = {
      exerciseId: exercise.id,
      currentWeight: exercise.startingWeight,
      consecutiveFailures: 0,
      updatedAt: now(),
      lastWarmupWeights: null,
    };
    await repo.upsertExercise(exercise);
    await repo.upsertExerciseState(initialState);
    set((state) => ({
      exercises: [...state.exercises, exercise],
      exerciseStates: { ...state.exerciseStates, [exercise.id]: initialState },
    }));
    return exercise;
  },

  updateExercise: async (exercise) => {
    await repo.upsertExercise(exercise);
    set((state) => ({ exercises: state.exercises.map((e) => (e.id === exercise.id ? exercise : e)) }));
  },

  archiveExercise: async (id) => {
    const exercise = get().exercises.find((e) => e.id === id);
    if (!exercise || exercise.isCore) return;
    const archived = { ...exercise, archived: true };
    await repo.upsertExercise(archived);
    set((state) => ({ exercises: state.exercises.map((e) => (e.id === id ? archived : e)) }));
  },

  restoreExercise: async (id) => {
    const exercise = get().exercises.find((e) => e.id === id);
    if (!exercise) return;
    const restored = { ...exercise, archived: false };
    await repo.upsertExercise(restored);
    set((state) => ({ exercises: state.exercises.map((e) => (e.id === id ? restored : e)) }));
  },

  setExerciseCurrentWeight: async (exerciseId, weight) => {
    const priorState = get().exerciseStates[exerciseId];
    const nextState: ExerciseState = {
      exerciseId,
      currentWeight: weight,
      consecutiveFailures: priorState?.consecutiveFailures ?? 0,
      updatedAt: now(),
      lastWarmupWeights: priorState?.lastWarmupWeights ?? null,
    };
    await repo.upsertExerciseState(nextState);
    set((state) => ({ exerciseStates: { ...state.exerciseStates, [exerciseId]: nextState } }));
  },
}));

export { CORE_EXERCISE_IDS };
export type { CompletionSummaryItem };
