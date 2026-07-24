import type { Exercise, Unit, WorkoutType } from './types';

// The five core lifts, keyed by a stable id used throughout the app.
export const CORE_EXERCISE_IDS = {
  squat: 'core-squat',
  bench: 'core-bench',
  row: 'core-row',
  press: 'core-press',
  deadlift: 'core-deadlift',
} as const;

export const WORKOUT_TEMPLATES: Record<WorkoutType, string[]> = {
  A: [CORE_EXERCISE_IDS.squat, CORE_EXERCISE_IDS.bench, CORE_EXERCISE_IDS.row],
  B: [CORE_EXERCISE_IDS.squat, CORE_EXERCISE_IDS.press, CORE_EXERCISE_IDS.deadlift],
};

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

export function buildCoreExercises(unit: Unit, experience: ExperienceLevel, barWeight: number): Exercise[] {
  const now = 0; // caller stamps createdAt via repository; domain stays pure/deterministic
  return CORE_LIFT_DEFAULTS.map((def) => ({
    id: def.id,
    name: def.name,
    kind: 'barbell',
    isCore: true,
    defaultSets: def.defaultSets,
    defaultReps: def.defaultReps,
    increment: def.increment[unit],
    progression: 'linear',
    startingWeight: def.startingWeight[unit][experience],
    barWeight,
    failuresBeforeDeload: 3,
    deloadPercent: 0.1,
    archived: false,
    createdAt: now,
    assignment: 'none',
    order: 0,
  }));
}

export function coreLiftName(exerciseId: string): string | undefined {
  return CORE_LIFT_DEFAULTS.find((d) => d.id === exerciseId)?.name;
}
