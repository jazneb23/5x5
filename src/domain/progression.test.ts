import { describe, expect, it } from 'vitest';
import { applyProgression, exerciseSucceeded, minimumStep, recomputeExerciseStates, roundDownToLoadable, setSucceeded } from './progression';
import type { Exercise, ExerciseLog, ExerciseState, Workout } from './types';

const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex',
    name: 'Bench Press',
    kind: 'barbell',
    isCore: true,
    defaultSets: 5,
    defaultReps: 5,
    increment: 5,
    progression: 'linear',
    startingWeight: 45,
    barWeight: 45,
    failuresBeforeDeload: 3,
    deloadPercent: 0.1,
    archived: false,
    createdAt: 0,
    assignment: 'none',
    order: 0,
    ...overrides,
  };
}

function state(overrides: Partial<ExerciseState> = {}): ExerciseState {
  return { exerciseId: 'ex', currentWeight: 185, consecutiveFailures: 0, updatedAt: 0, ...overrides };
}

describe('minimumStep', () => {
  it('is twice the smallest available plate', () => {
    expect(minimumStep(LB_PLATES)).toBe(5);
  });

  it('drops to 2.5 lb steps once 1.25 lb plates are in the inventory', () => {
    expect(minimumStep([...LB_PLATES, 1.25])).toBe(2.5);
  });
});

describe('roundDownToLoadable', () => {
  it('rounds down 166.5 to 165 with a 5 lb step', () => {
    expect(roundDownToLoadable(166.5, 45, LB_PLATES)).toBe(165);
  });

  it('clamps to bar weight when the result would drop below it', () => {
    expect(roundDownToLoadable(30, 45, LB_PLATES)).toBe(45);
  });

  it('returns an already-loadable weight unchanged', () => {
    expect(roundDownToLoadable(185, 45, LB_PLATES)).toBe(185);
  });
});

describe('setSucceeded', () => {
  it('succeeds when completed reps meet or exceed target', () => {
    expect(setSucceeded(5, 5)).toBe(true);
    expect(setSucceeded(5, 6)).toBe(true);
  });

  it('fails when completed reps are below target or unlogged', () => {
    expect(setSucceeded(5, 4)).toBe(false);
    expect(setSucceeded(5, null)).toBe(false);
  });
});

describe('exerciseSucceeded', () => {
  function log(sets: ExerciseLog['sets']): ExerciseLog {
    return { exerciseId: 'ex', order: 0, prescribedWeight: 185, sets, succeeded: null, note: null };
  }

  it('succeeds only when every work set hits target reps', () => {
    const sets = Array.from({ length: 5 }, (_, i) => ({
      setIndex: i,
      targetReps: 5,
      completedReps: 5,
      weight: 185,
      isWarmup: false,
      loggedAt: 1,
    }));
    expect(exerciseSucceeded(log(sets))).toBe(true);
  });

  it('fails when any single work set misses', () => {
    const sets = [
      { setIndex: 0, targetReps: 5, completedReps: 5, weight: 185, isWarmup: false, loggedAt: 1 },
      { setIndex: 1, targetReps: 5, completedReps: 5, weight: 185, isWarmup: false, loggedAt: 1 },
      { setIndex: 2, targetReps: 5, completedReps: 5, weight: 185, isWarmup: false, loggedAt: 1 },
      { setIndex: 3, targetReps: 5, completedReps: 3, weight: 185, isWarmup: false, loggedAt: 1 },
      { setIndex: 4, targetReps: 5, completedReps: 3, weight: 185, isWarmup: false, loggedAt: 1 },
    ];
    expect(exerciseSucceeded(log(sets))).toBe(false);
  });

  it('ignores warmup sets entirely', () => {
    const sets = [
      { setIndex: 0, targetReps: 5, completedReps: 0, weight: 45, isWarmup: true, loggedAt: 1 },
      ...Array.from({ length: 5 }, (_, i) => ({
        setIndex: i + 1,
        targetReps: 5,
        completedReps: 5,
        weight: 185,
        isWarmup: false,
        loggedAt: 1,
      })),
    ];
    expect(exerciseSucceeded(log(sets))).toBe(true);
  });

  it('logging zero reps on every set fails the exercise (edge case, section 12)', () => {
    const sets = Array.from({ length: 5 }, (_, i) => ({
      setIndex: i,
      targetReps: 5,
      completedReps: 0,
      weight: 185,
      isWarmup: false,
      loggedAt: 1,
    }));
    expect(exerciseSucceeded(log(sets))).toBe(false);
  });

  it('an exercise with no logged work sets does not succeed', () => {
    expect(exerciseSucceeded(log([]))).toBe(false);
  });
});

describe('applyProgression', () => {
  it('adds the increment and resets the failure counter on success', () => {
    const result = applyProgression(exercise({ increment: 5 }), state({ currentWeight: 185 }), true, LB_PLATES, 100);
    expect(result.state.currentWeight).toBe(190);
    expect(result.state.consecutiveFailures).toBe(0);
    expect(result.deload).toBeNull();
  });

  it('holds the weight and increments the failure counter on a first failure', () => {
    const result = applyProgression(
      exercise({ failuresBeforeDeload: 3 }),
      state({ currentWeight: 185, consecutiveFailures: 0 }),
      false,
      LB_PLATES,
      100,
    );
    expect(result.state.currentWeight).toBe(185);
    expect(result.state.consecutiveFailures).toBe(1);
    expect(result.deload).toBeNull();
  });

  it('deloads 10 percent, rounded down to loadable, on the third consecutive failure, and resets the counter', () => {
    // Section 5.6 worked example: Bench 185, increment 5, 3 failures allowed, 10% deload.
    const result = applyProgression(
      exercise({ increment: 5, failuresBeforeDeload: 3, deloadPercent: 0.1 }),
      state({ currentWeight: 185, consecutiveFailures: 2 }),
      false,
      LB_PLATES,
      100,
    );
    expect(result.state.currentWeight).toBe(165); // 185 * 0.9 = 166.5 -> 165
    expect(result.state.consecutiveFailures).toBe(0);
    expect(result.deload).toEqual({ fromWeight: 185, toWeight: 165 });
  });

  it('reproduces the full section 5.6 worked example across four sessions', () => {
    const ex = exercise({ increment: 5, failuresBeforeDeload: 3, deloadPercent: 0.1 });
    let s = state({ currentWeight: 185, consecutiveFailures: 0 });

    // Session 1: fail
    let r = applyProgression(ex, s, false, LB_PLATES, 1);
    expect(r.state.currentWeight).toBe(185);
    expect(r.state.consecutiveFailures).toBe(1);
    s = r.state;

    // Session 2: fail
    r = applyProgression(ex, s, false, LB_PLATES, 2);
    expect(r.state.currentWeight).toBe(185);
    expect(r.state.consecutiveFailures).toBe(2);
    s = r.state;

    // Session 3: fail -> deload
    r = applyProgression(ex, s, false, LB_PLATES, 3);
    expect(r.state.currentWeight).toBe(165);
    expect(r.state.consecutiveFailures).toBe(0);
    s = r.state;

    // Session 4: pass -> increment from the deloaded weight
    r = applyProgression(ex, s, true, LB_PLATES, 4);
    expect(r.state.currentWeight).toBe(170);
    expect(r.state.consecutiveFailures).toBe(0);
  });

  it('clamps a deload that would drop below bar weight to the bar weight', () => {
    const ex = exercise({ barWeight: 45, deloadPercent: 0.5, failuresBeforeDeload: 1 });
    const result = applyProgression(ex, state({ currentWeight: 50, consecutiveFailures: 0 }), false, LB_PLATES, 1);
    expect(result.state.currentWeight).toBe(45);
  });

  it('exercises progress independently: failing one leaves another exercise state untouched by construction', () => {
    // applyProgression only ever receives one exercise's state, so independence
    // is structural: calling it for Bench cannot mutate Squat's state object.
    const benchState = state({ exerciseId: 'bench', currentWeight: 185 });
    const squatState = state({ exerciseId: 'squat', currentWeight: 225 });
    applyProgression(exercise({ id: 'bench' }), benchState, false, LB_PLATES, 1);
    expect(squatState.currentWeight).toBe(225);
  });

  it('manual and none progression schemes leave weight untouched regardless of outcome', () => {
    const manual = exercise({ progression: 'manual' });
    const result = applyProgression(manual, state({ currentWeight: 100 }), false, LB_PLATES, 1);
    expect(result.state.currentWeight).toBe(100);
    expect(result.deload).toBeNull();
  });
});

describe('recomputeExerciseStates', () => {
  function workoutFor(id: string, completedAt: number, exerciseId: string, weight: number, succeeded: boolean): Workout {
    return {
      id,
      type: 'A',
      startedAt: completedAt - 1000,
      completedAt,
      bodyweight: null,
      note: null,
      exercises: [
        {
          exerciseId,
          order: 0,
          prescribedWeight: weight,
          succeeded: null,
          note: null,
          sets: Array.from({ length: 5 }, (_, i) => ({
            setIndex: i,
            targetReps: 5,
            completedReps: succeeded ? 5 : 0,
            weight,
            isWarmup: false,
            loggedAt: completedAt,
          })),
        },
      ],
    };
  }

  it('rebuilds state identically to sequential applyProgression calls', () => {
    const ex = exercise({ id: 'bench', startingWeight: 135, increment: 5, failuresBeforeDeload: 3 });
    const workouts = [
      workoutFor('w1', 100, 'bench', 135, true),
      workoutFor('w2', 200, 'bench', 140, true),
      workoutFor('w3', 300, 'bench', 145, false),
    ];
    const { states } = recomputeExerciseStates([ex], workouts, LB_PLATES);
    expect(states.bench.currentWeight).toBe(145);
    expect(states.bench.consecutiveFailures).toBe(1);
  });

  it('reproduces a deload when replayed from scratch', () => {
    const ex = exercise({ id: 'bench', startingWeight: 185, increment: 5, failuresBeforeDeload: 3, deloadPercent: 0.1 });
    const workouts = [
      workoutFor('w1', 100, 'bench', 185, false),
      workoutFor('w2', 200, 'bench', 185, false),
      workoutFor('w3', 300, 'bench', 185, false),
    ];
    const { states, deloadEvents } = recomputeExerciseStates([ex], workouts, LB_PLATES);
    expect(states.bench.currentWeight).toBe(165);
    expect(deloadEvents).toHaveLength(1);
    expect(deloadEvents[0]).toMatchObject({ exerciseId: 'bench', fromWeight: 185, toWeight: 165 });
  });

  it('ignores workouts that do not include the exercise', () => {
    const ex = exercise({ id: 'squat', startingWeight: 135 });
    const other = workoutFor('w1', 100, 'bench', 135, true);
    const { states } = recomputeExerciseStates([ex], [other], LB_PLATES);
    expect(states.squat.currentWeight).toBe(135);
  });
});
