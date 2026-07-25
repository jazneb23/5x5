import { describe, expect, it } from 'vitest';
import { allTimeBest, derivePersonalRecords, estimated1RM } from './prs';
import type { Workout } from './types';

function completedWorkout(id: string, completedAt: number, weight: number, succeeded: boolean, reps = 5): Workout {
  return {
    id,
    type: 'A',
    startedAt: completedAt - 1000,
    completedAt,
    bodyweight: null,
    note: null,
    exercises: [
      {
        exerciseId: 'ex',
        order: 0,
        prescribedWeight: weight,
        succeeded,
        note: null,
        skipped: false,
        sets: Array.from({ length: 5 }, (_, i) => ({
          setIndex: i,
          targetReps: reps,
          completedReps: succeeded ? reps : 0,
          weight,
          isWarmup: false,
          loggedAt: completedAt,
        })),
      },
    ],
  };
}

describe('estimated1RM', () => {
  it('uses the Epley formula', () => {
    expect(estimated1RM(185, 5)).toBeCloseTo(185 * (1 + 5 / 30), 5);
  });

  it('is zero for zero reps', () => {
    expect(estimated1RM(185, 0)).toBe(0);
  });
});

describe('derivePersonalRecords', () => {
  it('records a new PR only on strict improvement over prior successful weight', () => {
    const workouts = [
      completedWorkout('w1', 100, 135, true),
      completedWorkout('w2', 200, 135, true), // tie, not a record
      completedWorkout('w3', 300, 145, false), // failed, not a record
      completedWorkout('w4', 400, 155, true), // improvement
    ];
    const records = derivePersonalRecords(workouts, 'ex');
    expect(records.map((r) => r.weight)).toEqual([135, 155]);
  });

  it('ignores in-progress (uncompleted) workouts', () => {
    const inProgress: Workout = { ...completedWorkout('w1', 100, 200, true), completedAt: null };
    const records = derivePersonalRecords([inProgress], 'ex');
    expect(records).toEqual([]);
  });

  it('is empty when the exercise was never logged', () => {
    const workouts = [completedWorkout('w1', 100, 135, true)];
    expect(derivePersonalRecords(workouts, 'other-ex')).toEqual([]);
  });
});

describe('allTimeBest', () => {
  it('returns the most recent (highest) record', () => {
    const workouts = [completedWorkout('w1', 100, 135, true), completedWorkout('w2', 200, 155, true)];
    expect(allTimeBest(workouts, 'ex')?.weight).toBe(155);
  });

  it('returns null when there is no record', () => {
    expect(allTimeBest([], 'ex')).toBeNull();
  });
});
