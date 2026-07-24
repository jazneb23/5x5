// Pure domain types. No React, no browser APIs, no imports from data/state/features/components.

export type Unit = 'lb' | 'kg';
export type WorkoutType = 'A' | 'B';

export type ExerciseKind =
  | 'barbell' // weight + reps, plate math applies
  | 'dumbbell' // weight + reps, weight is per dumbbell
  | 'bodyweight' // reps only, optional added weight
  | 'machine' // weight + reps, no plate math
  | 'timed' // duration in seconds
  | 'distance'; // distance + duration

export type ProgressionScheme =
  | 'linear' // +increment on success, deload after N failures
  | 'manual' // user sets the weight each time
  | 'none'; // no weight tracked

export type WorkoutAssignment = 'A' | 'B' | 'both' | 'none';

export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  isCore: boolean; // true for the five program lifts. core lifts cannot be deleted.
  defaultSets: number;
  defaultReps: number;
  increment: number; // weight/value added on a successful session
  progression: ProgressionScheme;
  startingWeight: number;
  barWeight: number | null; // null for non-barbell kinds
  failuresBeforeDeload: number; // default 3
  deloadPercent: number; // default 0.10
  archived: boolean;
  createdAt: number;
  assignment: WorkoutAssignment; // which workout(s) a custom exercise appears in
  order: number; // position among custom exercises attached to a workout
}

export interface ExerciseState {
  exerciseId: string;
  currentWeight: number; // the weight/value prescribed for the next session
  consecutiveFailures: number; // failed attempts at currentWeight
  updatedAt: number;
}

export interface SetLog {
  setIndex: number; // 0-based
  targetReps: number;
  completedReps: number | null; // null means not yet logged
  weight: number;
  isWarmup: boolean;
  loggedAt: number | null;
  // used by 'timed' and 'distance' kinds instead of / in addition to weight
  durationSeconds?: number | null;
  distance?: number | null;
}

export interface ExerciseLog {
  exerciseId: string;
  order: number;
  prescribedWeight: number;
  sets: SetLog[];
  succeeded: boolean | null; // computed on session completion
  note: string | null;
}

export interface Workout {
  id: string;
  type: WorkoutType | 'custom';
  startedAt: number;
  completedAt: number | null; // null means in progress or abandoned
  exercises: ExerciseLog[];
  bodyweight: number | null;
  note: string | null;
}

export interface DeloadEvent {
  exerciseId: string;
  workoutId: string;
  at: number;
  fromWeight: number;
  toWeight: number;
}

export interface Settings {
  unit: Unit;
  barWeight: number; // default 45 lb / 20 kg
  availablePlates: number[]; // descending. default lb: [45,35,25,10,5,2.5]
  restSeconds: number; // default 90
  restSecondsAfterFailedSet: number; // default 180
  restSecondsWarmup: number; // default 60
  restTimerEnabled: boolean; // default true
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  keepScreenAwake: boolean; // default true
  showWarmupSets: boolean; // default true
  preferredTrainingDays: number[]; // 0 = Sunday
  onboardingComplete: boolean;
  lastExportAt: number | null;
}

export interface PlateBreakdown {
  plates: number[]; // one side, heaviest first
  remainder: number; // non-zero means not loadable with current inventory
}

export interface WarmupSet {
  setIndex: number;
  targetReps: number;
  weight: number;
}

export interface PersonalRecord {
  exerciseId: string;
  workoutId: string;
  at: number;
  weight: number;
  reps: number; // reps per set at the time of the record (5x5 or 1x5)
  estimated1RM: number;
}

export const DEFAULT_FAILURES_BEFORE_DELOAD = 3;
export const DEFAULT_DELOAD_PERCENT = 0.1;
