import { db, SETTINGS_ROW_ID, type SettingsRow } from './db';
import type { DeloadEvent, Exercise, ExerciseState, Settings, Workout } from '../domain/types';

// The only module allowed to import ./db. Features and state go through here.

export const DEFAULT_SETTINGS: Settings = {
  unit: 'lb',
  barWeight: 45,
  availablePlates: [45, 35, 25, 10, 5, 2.5],
  restSeconds: 90,
  restSecondsAfterFailedSet: 180,
  restSecondsWarmup: 60,
  restTimerEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  notificationsEnabled: false,
  keepScreenAwake: true,
  showWarmupSets: true,
  preferredTrainingDays: [1, 3, 5],
  onboardingComplete: false,
  lastExportAt: null,
};

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_ROW_ID);
  if (!row) return DEFAULT_SETTINGS;
  const { id: _id, ...settings } = row;
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ ...settings, id: SETTINGS_ROW_ID } as SettingsRow);
}

export async function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.toArray();
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

export async function upsertExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise);
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
  await db.exerciseStates.delete(id);
}

export async function getAllExerciseStates(): Promise<ExerciseState[]> {
  return db.exerciseStates.toArray();
}

export async function getExerciseState(exerciseId: string): Promise<ExerciseState | undefined> {
  return db.exerciseStates.get(exerciseId);
}

export async function upsertExerciseState(state: ExerciseState): Promise<void> {
  await db.exerciseStates.put(state);
}

export async function getAllWorkouts(): Promise<Workout[]> {
  return db.workouts.orderBy('startedAt').reverse().toArray();
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  return db.workouts.get(id);
}

export async function getInProgressWorkout(): Promise<Workout | undefined> {
  return db.workouts.filter((w) => w.completedAt == null).first();
}

export async function saveWorkout(workout: Workout): Promise<void> {
  await db.workouts.put(workout);
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id);
}

export async function recordDeloadEvent(event: DeloadEvent): Promise<void> {
  await db.deloadEvents.add(event);
}

export async function getDeloadEvents(exerciseId?: string): Promise<DeloadEvent[]> {
  if (exerciseId) return db.deloadEvents.where('exerciseId').equals(exerciseId).toArray();
  return db.deloadEvents.toArray();
}

/**
 * Atomically replaces every exercise state and every deload event. Used when
 * a past workout is edited or deleted and progression must be replayed from
 * scratch (requirements sections 9.4 and 12).
 */
export async function replaceExerciseStatesAndDeloads(states: ExerciseState[], deloadEvents: DeloadEvent[]): Promise<void> {
  await db.transaction('rw', db.exerciseStates, db.deloadEvents, async () => {
    await db.exerciseStates.clear();
    await db.exerciseStates.bulkAdd(states);
    await db.deloadEvents.clear();
    if (deloadEvents.length > 0) await db.deloadEvents.bulkAdd(deloadEvents as (DeloadEvent & { id?: number })[]);
  });
}

export interface FullExport {
  schemaVersion: number;
  exportedAt: number;
  exercises: Exercise[];
  exerciseStates: ExerciseState[];
  workouts: Workout[];
  settings: Settings;
  deloadEvents: DeloadEvent[];
}

export const SCHEMA_VERSION = 1;

export async function exportAll(now: number): Promise<FullExport> {
  const [exercises, exerciseStates, workouts, settings, deloadEvents] = await Promise.all([
    getAllExercises(),
    getAllExerciseStates(),
    getAllWorkouts(),
    getSettings(),
    getDeloadEvents(),
  ]);
  return { schemaVersion: SCHEMA_VERSION, exportedAt: now, exercises, exerciseStates, workouts, settings, deloadEvents };
}

export async function importAll(data: FullExport): Promise<void> {
  await db.transaction('rw', db.exercises, db.exerciseStates, db.workouts, db.settings, db.deloadEvents, async () => {
    await Promise.all([
      db.exercises.clear(),
      db.exerciseStates.clear(),
      db.workouts.clear(),
      db.deloadEvents.clear(),
    ]);
    await db.exercises.bulkAdd(data.exercises);
    await db.exerciseStates.bulkAdd(data.exerciseStates);
    await db.workouts.bulkAdd(data.workouts);
    if (data.deloadEvents.length > 0) await db.deloadEvents.bulkAdd(data.deloadEvents as (DeloadEvent & { id?: number })[]);
    await saveSettings(data.settings);
  });
}

/**
 * Section 12 edge case: unit switched after data exists. Converts every
 * stored weight (exercise definitions, current states, and every historical
 * set) to the new unit in one transaction. Historical values become
 * converted numbers, not re-measurements — the settings screen warns about
 * this before calling in.
 */
export async function convertAllWeights(
  convert: (weight: number) => number,
  newSettings: Settings,
): Promise<void> {
  await db.transaction('rw', db.exercises, db.exerciseStates, db.workouts, db.settings, async () => {
    const [exercises, states, workouts] = await Promise.all([
      db.exercises.toArray(),
      db.exerciseStates.toArray(),
      db.workouts.toArray(),
    ]);

    await Promise.all(
      exercises.map((e) =>
        db.exercises.put({
          ...e,
          startingWeight: convert(e.startingWeight),
          increment: convert(e.increment),
          barWeight: e.barWeight != null ? convert(e.barWeight) : null,
        }),
      ),
    );

    await Promise.all(
      states.map((s) => db.exerciseStates.put({ ...s, currentWeight: convert(s.currentWeight) })),
    );

    await Promise.all(
      workouts.map((w) =>
        db.workouts.put({
          ...w,
          bodyweight: w.bodyweight != null ? convert(w.bodyweight) : null,
          exercises: w.exercises.map((log) => ({
            ...log,
            prescribedWeight: convert(log.prescribedWeight),
            sets: log.sets.map((s) => ({ ...s, weight: convert(s.weight) })),
          })),
        }),
      ),
    );

    await saveSettings(newSettings);
  });
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', db.exercises, db.exerciseStates, db.workouts, db.settings, db.deloadEvents, async () => {
    await Promise.all([
      db.exercises.clear(),
      db.exerciseStates.clear(),
      db.workouts.clear(),
      db.settings.clear(),
      db.deloadEvents.clear(),
    ]);
  });
}
