import { roundDownToLoadable } from './progression';
import type { Exercise, Unit, WorkoutType } from './types';

// The core lifts, keyed by a stable id used throughout the app.
export const CORE_EXERCISE_IDS = {
  squat: 'core-squat',
  squatVolume: 'core-squat-volume',
  bench: 'core-bench',
  row: 'core-row',
  press: 'core-press',
  deadlift: 'core-deadlift',
} as const;

/**
 * Workout A squats for volume: four work sets of 12/10/8/8 at one lighter
 * weight. Workout B keeps the heavy 5x5. They are separate exercises with
 * separate weights and separate progression tracks — a miss on the volume
 * squat never touches the heavy squat, and vice versa.
 */
export const VOLUME_SQUAT_REP_SCHEME = [12, 10, 8, 8];

/** Where the volume squat starts relative to the heavy squat's current weight. */
export const VOLUME_SQUAT_PERCENT = 0.65;

export const WORKOUT_TEMPLATES: Record<WorkoutType, string[]> = {
  A: [CORE_EXERCISE_IDS.squatVolume, CORE_EXERCISE_IDS.bench, CORE_EXERCISE_IDS.row],
  B: [CORE_EXERCISE_IDS.squat, CORE_EXERCISE_IDS.press, CORE_EXERCISE_IDS.deadlift],
};

/**
 * The rep target of each work set, in set order. Uniform exercises expand
 * `defaultReps` across `defaultSets`; an exercise carrying a `repScheme` uses
 * it verbatim and its length wins over `defaultSets`.
 *
 * Reads `repScheme` defensively: rows written before the field existed come
 * back from Dexie without it.
 */
export function workSetRepTargets(
  exercise: Pick<Exercise, 'defaultSets' | 'defaultReps' | 'repScheme'>,
): number[] {
  const scheme = exercise.repScheme;
  if (scheme != null && scheme.length > 0) return [...scheme];
  return Array.from({ length: Math.max(0, exercise.defaultSets) }, () => exercise.defaultReps);
}

/** "5x5", "1x5", "12/10/8/8" — the set-and-rep shape in one short label. */
export function repSchemeLabel(
  exercise: Pick<Exercise, 'defaultSets' | 'defaultReps' | 'repScheme'>,
): string {
  const targets = workSetRepTargets(exercise);
  if (targets.length === 0) return '';
  const uniform = targets.every((r) => r === targets[0]);
  return uniform ? `${targets.length}x${targets[0]}` : targets.join('/');
}

/**
 * Parses a rep prescription written as one number ("5") or one per work set
 * ("12/10/8/8", "12, 10, 8, 8"). Returns null when any token is not a positive
 * whole number, so the caller can reject the input rather than silently
 * dropping sets.
 */
export function parseRepTargets(text: string): number[] | null {
  const tokens = text.split(/[,/\s]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const targets = tokens.map(Number);
  if (targets.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return targets;
}

/**
 * The volume squat's weight derived from the heavy squat's — used to seed it
 * at onboarding and when adding it to an account that predates it. After that
 * it progresses on its own and is never recomputed from the heavy squat.
 */
export function volumeSquatWeightFor(
  heavySquatWeight: number,
  barWeight: number,
  availablePlates: number[],
): number {
  return roundDownToLoadable(heavySquatWeight * VOLUME_SQUAT_PERCENT, barWeight, availablePlates);
}

/**
 * The next workout type is determined by the last completed workout, never the
 * calendar date. `undefined`/`null` (no workout ever completed) means A.
 */
export function nextWorkoutType(lastCompletedWorkoutType: WorkoutType | null | undefined): WorkoutType {
  if (lastCompletedWorkoutType == null) return 'A';
  return lastCompletedWorkoutType === 'A' ? 'B' : 'A';
}

export type ExperienceLevel = 'new' | 'some';

interface CoreLiftDefaults {
  id: string;
  name: string;
  startingWeight: Record<Unit, Record<ExperienceLevel, number>>;
  increment: Record<Unit, number>;
  defaultSets: number;
  defaultReps: number;
  repScheme?: number[];
  floor: Record<Unit, number>;
}

// Section 5.3 (increments), 5.4 (starting weights), 7 (floors). kg values are
// the requirements' lb figures converted and rounded to a loadable kg step.
const CORE_LIFT_DEFAULTS: CoreLiftDefaults[] = [
  {
    id: CORE_EXERCISE_IDS.squat,
    name: 'Squat',
    startingWeight: { lb: { new: 45, some: 115 }, kg: { new: 20, some: 50 } },
    increment: { lb: 5, kg: 2.5 },
    defaultSets: 5,
    defaultReps: 5,
    floor: { lb: 45, kg: 20 },
  },
  {
    id: CORE_EXERCISE_IDS.squatVolume,
    name: 'Squat (Volume)',
    // Roughly VOLUME_SQUAT_PERCENT of the heavy squat's starting weight, on a
    // loadable step. A new lifter is already at the bar, so there is nowhere
    // lighter to start.
    startingWeight: { lb: { new: 45, some: 75 }, kg: { new: 20, some: 32.5 } },
    increment: { lb: 5, kg: 2.5 },
    defaultSets: VOLUME_SQUAT_REP_SCHEME.length,
    defaultReps: VOLUME_SQUAT_REP_SCHEME[0],
    repScheme: VOLUME_SQUAT_REP_SCHEME,
    floor: { lb: 45, kg: 20 },
  },
  {
    id: CORE_EXERCISE_IDS.bench,
    name: 'Bench Press',
    startingWeight: { lb: { new: 45, some: 115 }, kg: { new: 20, some: 50 } },
    increment: { lb: 5, kg: 2.5 },
    defaultSets: 5,
    defaultReps: 5,
    floor: { lb: 45, kg: 20 },
  },
  {
    id: CORE_EXERCISE_IDS.press,
    name: 'Overhead Press',
    startingWeight: { lb: { new: 45, some: 80 }, kg: { new: 20, some: 35 } },
    increment: { lb: 5, kg: 2.5 },
    defaultSets: 5,
    defaultReps: 5,
    floor: { lb: 45, kg: 20 },
  },
  {
    id: CORE_EXERCISE_IDS.row,
    name: 'Barbell Row',
    startingWeight: { lb: { new: 65, some: 115 }, kg: { new: 30, some: 50 } },
    increment: { lb: 5, kg: 2.5 },
    defaultSets: 5,
    defaultReps: 5,
    floor: { lb: 65, kg: 30 },
  },
  {
    id: CORE_EXERCISE_IDS.deadlift,
    name: 'Deadlift',
    startingWeight: { lb: { new: 95, some: 160 }, kg: { new: 40, some: 70 } },
    increment: { lb: 10, kg: 5 },
    defaultSets: 1,
    defaultReps: 5,
    floor: { lb: 95, kg: 40 },
  },
];

export function warmupFloor(exerciseId: string, unit: Unit): number {
  const def = CORE_LIFT_DEFAULTS.find((d) => d.id === exerciseId);
  if (def) return def.floor[unit];
  // Non-core exercises fall back to bar weight as the floor.
  return unit === 'lb' ? 45 : 20;
}

function buildCoreExercise(def: CoreLiftDefaults, unit: Unit, barWeight: number, startingWeight: number): Exercise {
  return {
    id: def.id,
    name: def.name,
    kind: 'barbell',
    isCore: true,
    defaultSets: def.defaultSets,
    defaultReps: def.defaultReps,
    repScheme: def.repScheme ? [...def.repScheme] : null,
    increment: def.increment[unit],
    progression: 'linear',
    startingWeight,
    barWeight,
    failuresBeforeDeload: 3,
    deloadPercent: 0.1,
    archived: false,
    createdAt: 0, // caller stamps createdAt via repository; domain stays pure/deterministic
    assignment: 'none',
    order: 0,
  };
}

export function buildCoreExercises(unit: Unit, experience: ExperienceLevel, barWeight: number): Exercise[] {
  return CORE_LIFT_DEFAULTS.map((def) =>
    buildCoreExercise(def, unit, barWeight, def.startingWeight[unit][experience]),
  );
}

/**
 * The volume squat on its own, for accounts created before Workout A moved to
 * it. Seeded from the heavy squat's current weight rather than the onboarding
 * table, so an established lifter does not restart at the bar.
 */
export function buildVolumeSquatExercise(unit: Unit, barWeight: number, startingWeight: number): Exercise {
  const def = CORE_LIFT_DEFAULTS.find((d) => d.id === CORE_EXERCISE_IDS.squatVolume);
  if (!def) throw new Error('volume squat is missing from the core lift table');
  return buildCoreExercise(def, unit, barWeight, startingWeight);
}

export function coreLiftName(exerciseId: string): string | undefined {
  return CORE_LIFT_DEFAULTS.find((d) => d.id === exerciseId)?.name;
}
