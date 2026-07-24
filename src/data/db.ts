import Dexie, { type EntityTable } from 'dexie';
import type { DeloadEvent, Exercise, ExerciseState, Settings, Workout } from '../domain/types';

// Settings is a singleton row, keyed by a constant id so Dexie can address it.
export interface SettingsRow extends Settings {
  id: 'settings';
}

export const SETTINGS_ROW_ID = 'settings' as const;

class FiveByFiveDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  exerciseStates!: EntityTable<ExerciseState, 'exerciseId'>;
  workouts!: EntityTable<Workout, 'id'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  deloadEvents!: EntityTable<DeloadEvent & { id?: number }, 'id'>;

  constructor() {
    super('5x5');
    this.version(1).stores({
      exercises: 'id, isCore, archived, assignment',
      exerciseStates: 'exerciseId',
      workouts: 'id, type, startedAt, completedAt',
      settings: 'id',
      deloadEvents: '++id, exerciseId, at',
    });
  }
}

export const db = new FiveByFiveDB();
