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
import { buildCoreExercises, CORE_EXERCISE_IDS, nextWorkoutType, WORKOUT_TEMPLATES, warmupFloor, type ExperienceLevel } from '../domain/program';
import { applyProgression, exerciseSucceeded, failedWorkSets, recomputeExerciseStates, warmupWeightsFromLog, type FailedSetInfo } from '../domain/progression';
import { generateWarmupSets } from '../domain/warmup';
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

  if (settings.showWarmupSets && exercise.kind === 'barbell' && exercise.barWeight != null) {
    const floor = warmupFloor(exercise.id, settings.unit);
    const warmups = generateWarmupSets(prescribedWeight, exercise.barWeight, floor, settings.availablePlates);
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

  for (let i = 0; i < exercise.defaultSets; i++) {
    sets.push({
      setIndex: index++,
      targetReps: exercise.defaultReps,
      completedReps: null,
      weight: prescribedWeight,
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
    const [settings, exercises, states, currentWorkout] = await Promise.all([
      repo.getSettings(),
      repo.getAllExercises(),
      repo.getAllExerciseStates(),
      repo.getInProgressWorkout(),
    ]);
    const exerciseStates: Record<string, ExerciseState> = {};
    for (const s of states) exerciseStates[s.exerciseId] = s;
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

    const priorWorkouts = await repo.getAllWorkouts();
    const completedMostRecentFirst = priorWorkouts
      .filter((w) => w.completedAt != null)
      .sort((a, b) => (b.completedAt as number) - (a.completedAt as number));
    const lastFailureByExercise: Record<string, FailedSetInfo[]> = {};
    for (const exercise of ordered) {
      const failures = lastFailureForExercise(exercise.id, completedMostRecentFirst);
      if (failures.length > 0) lastFailureByExercise[exercise.id] = failures;
    }

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

      let newWarmups = oldWarmups;
      if (exercise.kind === 'barbell' && exercise.barWeight != null && oldWarmups.length > 0) {
        const floor = warmupFloor(exercise.id, settings.unit);
        const recommended = generateWarmupSets(weight, exercise.barWeight, floor, settings.availablePlates);
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

      const newWorkSets = oldWorkSets.map((s, i2) => ({
        ...s,
        setIndex: newWarmups.length + i2,
        weight: s.completedReps != null ? s.weight : weight,
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
    const completedAt = now();

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

    const finishedWorkout: Workout = { ...workout, exercises: finishedExercises, completedAt };
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
