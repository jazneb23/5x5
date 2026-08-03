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

describe('derivePersonalRecords under a load ramp', () => {
  /** A volume-squat session: 12/10/8/8 ramping 85/90/95/100 percent of `top`. */
  function rampedWorkout(id: string, completedAt: number, top: number, succeeded: boolean): Workout {
    const reps = [12, 10, 8, 8];
    const weights = [0.85, 0.9, 0.95, 1].map((f) => top * f);
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
          prescribedWeight: top,
          succeeded,
          note: null,
          skipped: false,
          sets: reps.map((targetReps, i) => ({
            setIndex: i,
            targetReps,
            completedReps: succeeded ? targetReps : 0,
            weight: weights[i],
            isWarmup: false,
            loggedAt: completedAt,
          })),
        },
      ],
    };
  }

  it('credits the top set with the reps it was actually prescribed for, not the first set’s', () => {
    const [record] = derivePersonalRecords([rampedWorkout('w1', 100, 200, true)], 'ex');
    // The top set is 200 for eight, not 200 for twelve — twelve was done at 170.
    expect(record.weight).toBe(200);
    expect(record.reps).toBe(8);
    expect(record.estimated1RM).toBeCloseTo(estimated1RM(200, 8), 5);
  });

  it('still records against the heaviest set as the ramp climbs', () => {
    const records = derivePersonalRecords(
      [rampedWorkout('w1', 100, 200, true), rampedWorkout('w2', 200, 195, true), rampedWorkout('w3', 300, 210, true)],
      'ex',
    );
    expect(records.map((r) => r.weight)).toEqual([200, 210]);
  });

  it('breaks a tie in weight toward the higher rep target', () => {
    // Near the bar the ramp collapses: every set lands on 45, but the twelve
    // is the harder set and the better estimate.
    const flatAtTheBar = rampedWorkout('w1', 100, 45, true);
    flatAtTheBar.exercises[0].sets = flatAtTheBar.exercises[0].sets.map((s) => ({ ...s, weight: 45 }));
    const [record] = derivePersonalRecords([flatAtTheBar], 'ex');
    expect(record.weight).toBe(45);
    expect(record.reps).toBe(12);
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
