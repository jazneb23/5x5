import type { DeloadEvent, Exercise, ExerciseLog, ExerciseState, SetLog, Workout } from './types';

/**
 * minimumStep = 2 * min(availablePlates); every loadable weight is
 * barWeight + a multiple of minimumStep. Section 5.5.
 */
export function minimumStep(availablePlates: number[]): number {
  const positive = availablePlates.filter((p) => p > 0);
  if (positive.length === 0) return 5;
  return 2 * Math.min(...positive);
}

export function roundDownToLoadable(
  weight: number,
  barWeight: number,
  availablePlates: number[],
): number {
  const step = minimumStep(availablePlates);
  if (weight <= barWeight) return barWeight;
  const steps = Math.floor((weight - barWeight) / step + 1e-9);
  return barWeight + steps * step;
}

/** A work set succeeds when completedReps >= targetReps. */
export function setSucceeded(targetReps: number, completedReps: number | null): boolean {
  return completedReps != null && completedReps >= targetReps;
}

/**
 * An exercise succeeds in a session when every work set succeeded. Warmup
 * sets are excluded from the test entirely. An exercise with no work sets
 * logged does not succeed.
 */
export function exerciseSucceeded(log: ExerciseLog): boolean {
  const workSets = log.sets.filter((s) => !s.isWarmup);
  if (workSets.length === 0) return false;
  return workSets.every((s) => setSucceeded(s.targetReps, s.completedReps));
}

export interface FailedSetInfo {
  /** 0-based rank among this log's work sets (not the raw SetLog.setIndex, which also counts warmups). */
  setIndex: number;
  completedReps: number;
  targetReps: number;
}

/** Work sets that missed target reps, in set order. Warmup sets never count. */
export function failedWorkSets(log: ExerciseLog): FailedSetInfo[] {
  const workSets = log.sets.filter((s) => !s.isWarmup);
  return workSets
    .map((s, workSetIndex) => ({ s, workSetIndex }))
    .filter(
      (entry): entry is { s: SetLog & { completedReps: number }; workSetIndex: number } =>
        entry.s.completedReps != null && entry.s.completedReps < entry.s.targetReps,
    )
    .map(({ s, workSetIndex }) => ({ setIndex: workSetIndex, completedReps: s.completedReps, targetReps: s.targetReps }));
}

/**
 * The warmup weights actually used in this log, in set order, for carrying
 * forward as next session's default (section 7: warmups never affect
 * progression, but remembering them is a pure UX convenience). Falls back to
 * whatever was remembered before when this log has no warmup sets at all —
 * e.g. `showWarmupSets` was off for that session.
 */
export function warmupWeightsFromLog(log: ExerciseLog, priorWarmupWeights: number[] | null): number[] | null {
  const weights = log.sets.filter((s) => s.isWarmup).map((s) => s.weight);
  return weights.length > 0 ? weights : priorWarmupWeights;
}

export interface DeloadResult {
  fromWeight: number;
  toWeight: number;
}

export interface ProgressionResult {
  state: ExerciseState;
  deload: DeloadResult | null;
}

/**
 * Applies the section 5.2 progression rule for one exercise given the
 * outcome of one completed workout. Exercises progress independently — this
 * function only ever sees one exercise's state.
 */
export function applyProgression(
  exercise: Exercise,
  priorState: ExerciseState,
  succeeded: boolean,
  availablePlates: number[],
  now: number,
): ProgressionResult {
  if (exercise.progression !== 'linear') {
    return { state: { ...priorState, updatedAt: now }, deload: null };
  }

  if (succeeded) {
    return {
      state: {
        exerciseId: exercise.id,
        currentWeight: priorState.currentWeight + exercise.increment,
        consecutiveFailures: 0,
        updatedAt: now,
        lastWarmupWeights: priorState.lastWarmupWeights,
      },
      deload: null,
    };
  }

  const consecutiveFailures = priorState.consecutiveFailures + 1;

  if (consecutiveFailures >= exercise.failuresBeforeDeload) {
    const barWeight = exercise.barWeight ?? 0;
    const raw = priorState.currentWeight * (1 - exercise.deloadPercent);
    const toWeight = Math.max(barWeight, roundDownToLoadable(raw, barWeight, availablePlates));
    return {
      state: {
        exerciseId: exercise.id,
        currentWeight: toWeight,
        consecutiveFailures: 0,
        updatedAt: now,
        lastWarmupWeights: priorState.lastWarmupWeights,
      },
      deload: { fromWeight: priorState.currentWeight, toWeight },
    };
  }

  return {
    state: {
      exerciseId: exercise.id,
      currentWeight: priorState.currentWeight,
      consecutiveFailures,
      updatedAt: now,
      lastWarmupWeights: priorState.lastWarmupWeights,
    },
    deload: null,
  };
}

export interface RecomputeResult {
  states: Record<string, ExerciseState>;
  deloadEvents: DeloadEvent[];
}

/**
 * Replays every completed workout, in chronological order, through
 * applyProgression to rebuild every exercise's current state from scratch.
 * Required whenever a past workout is edited or deleted (section 9.4, 12):
 * state cannot simply be patched because every later session's outcome
 * depends on the weight prescribed by the one before it.
 */
export function recomputeExerciseStates(
  exercises: Exercise[],
  completedWorkoutsChronological: Workout[],
  availablePlates: number[],
): RecomputeResult {
  const states: Record<string, ExerciseState> = {};
  const deloadEvents: DeloadEvent[] = [];

  for (const exercise of exercises) {
    states[exercise.id] = {
      exerciseId: exercise.id,
      currentWeight: exercise.startingWeight,
      consecutiveFailures: 0,
      updatedAt: 0,
      lastWarmupWeights: null,
    };
  }

  for (const workout of completedWorkoutsChronological) {
    if (workout.completedAt == null) continue;
    for (const log of workout.exercises) {
      const exercise = exercises.find((e) => e.id === log.exerciseId);
      if (!exercise) continue;
      const priorState = states[exercise.id] ?? {
        exerciseId: exercise.id,
        currentWeight: exercise.startingWeight,
        consecutiveFailures: 0,
        updatedAt: 0,
        lastWarmupWeights: null,
      };
      const succeeded = exerciseSucceeded(log);
      const result = applyProgression(exercise, priorState, succeeded, availablePlates, workout.completedAt);
      states[exercise.id] = {
        ...result.state,
        lastWarmupWeights: warmupWeightsFromLog(log, priorState.lastWarmupWeights),
      };
      if (result.deload) {
        deloadEvents.push({
          exerciseId: exercise.id,
          workoutId: workout.id,
          at: workout.completedAt,
          fromWeight: result.deload.fromWeight,
          toWeight: result.deload.toWeight,
        });
      }
    }
  }

  return { states, deloadEvents };
}
