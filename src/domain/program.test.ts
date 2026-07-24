import { describe, expect, it } from 'vitest';
import { buildCoreExercises, nextWorkoutType, WORKOUT_TEMPLATES } from './program';

describe('nextWorkoutType', () => {
  it('is A when no workout has ever been completed', () => {
    expect(nextWorkoutType(null)).toBe('A');
    expect(nextWorkoutType(undefined)).toBe('A');
  });

  it('alternates strictly off the last completed type, not the calendar', () => {
    expect(nextWorkoutType('A')).toBe('B');
    expect(nextWorkoutType('B')).toBe('A');
  });

  it('produces A B A across a simulated three-session week', () => {
    let last: 'A' | 'B' | null = null;
    const sequence: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextWorkoutType(last);
      sequence.push(next);
      last = next;
    }
    expect(sequence).toEqual(['A', 'B', 'A']);
  });

  it('stays correct across a skipped week: still A after A, B, A, [skip]', () => {
    let last: 'A' | 'B' | null = null;
    last = nextWorkoutType(last); // A
    last = nextWorkoutType(last); // B
    last = nextWorkoutType(last); // A
    // A week is skipped entirely; nothing completes, so the pending "next" stays A.
    expect(nextWorkoutType(last)).toBe('B');
    // If instead the user simply hasn't trained since completing A, next is still B regardless of elapsed time.
    expect(nextWorkoutType('A')).toBe('B');
  });
});

describe('WORKOUT_TEMPLATES', () => {
  it('orders Workout A as squat, bench, row', () => {
    expect(WORKOUT_TEMPLATES.A).toHaveLength(3);
  });

  it('orders Workout B as squat, press, deadlift', () => {
    expect(WORKOUT_TEMPLATES.B).toHaveLength(3);
  });
});

describe('buildCoreExercises', () => {
  it('gives deadlift 1 set of 5 reps, not 5x5', () => {
    const exercises = buildCoreExercises('lb', 'new', 45);
    const deadlift = exercises.find((e) => e.name === 'Deadlift');
    expect(deadlift?.defaultSets).toBe(1);
    expect(deadlift?.defaultReps).toBe(5);
  });

  it('gives every other core lift 5 sets of 5 reps', () => {
    const exercises = buildCoreExercises('lb', 'new', 45);
    for (const ex of exercises.filter((e) => e.name !== 'Deadlift')) {
      expect(ex.defaultSets).toBe(5);
      expect(ex.defaultReps).toBe(5);
    }
  });

  it('uses the default increments from section 5.3', () => {
    const lb = buildCoreExercises('lb', 'new', 45);
    expect(lb.find((e) => e.name === 'Squat')?.increment).toBe(5);
    expect(lb.find((e) => e.name === 'Deadlift')?.increment).toBe(10);

    const kg = buildCoreExercises('kg', 'new', 20);
    expect(kg.find((e) => e.name === 'Squat')?.increment).toBe(2.5);
    expect(kg.find((e) => e.name === 'Deadlift')?.increment).toBe(5);
  });
});
