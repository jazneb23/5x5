import { describe, expect, it } from 'vitest';
import {
  buildCoreExercises,
  buildVolumeSquatExercise,
  CORE_EXERCISE_IDS,
  hasLoadRamp,
  nextWorkoutType,
  parseRepTargets,
  repSchemeLabel,
  volumeSquatWeightFor,
  VOLUME_SQUAT_LOAD_SCHEME,
  VOLUME_SQUAT_REP_SCHEME,
  workSetRepTargets,
  workSetWeights,
  WORKOUT_TEMPLATES,
} from './program';

const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

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
  it('orders Workout A as volume squat, bench, row', () => {
    expect(WORKOUT_TEMPLATES.A).toEqual([CORE_EXERCISE_IDS.squatVolume, CORE_EXERCISE_IDS.bench, CORE_EXERCISE_IDS.row]);
  });

  it('orders Workout B as squat, press, deadlift', () => {
    expect(WORKOUT_TEMPLATES.B).toEqual([CORE_EXERCISE_IDS.squat, CORE_EXERCISE_IDS.press, CORE_EXERCISE_IDS.deadlift]);
  });

  it('keeps the heavy squat off Workout A so the two squats never share a weight', () => {
    expect(WORKOUT_TEMPLATES.A).not.toContain(CORE_EXERCISE_IDS.squat);
    expect(WORKOUT_TEMPLATES.B).not.toContain(CORE_EXERCISE_IDS.squatVolume);
  });

  it('still squats in every session', () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      const squats = template.filter((id) => id === CORE_EXERCISE_IDS.squat || id === CORE_EXERCISE_IDS.squatVolume);
      expect(squats).toHaveLength(1);
    }
  });
});

describe('buildCoreExercises', () => {
  it('gives deadlift 1 set of 5 reps, not 5x5', () => {
    const exercises = buildCoreExercises('lb', 'new', 45);
    const deadlift = exercises.find((e) => e.name === 'Deadlift');
    expect(deadlift?.defaultSets).toBe(1);
    expect(deadlift?.defaultReps).toBe(5);
  });

  it('gives the volume squat four sets of 12/10/8/8', () => {
    const exercises = buildCoreExercises('lb', 'new', 45);
    const volumeSquat = exercises.find((e) => e.id === CORE_EXERCISE_IDS.squatVolume);
    expect(volumeSquat?.defaultSets).toBe(4);
    expect(volumeSquat?.repScheme).toEqual([12, 10, 8, 8]);
    expect(workSetRepTargets(volumeSquat!)).toEqual([12, 10, 8, 8]);
  });

  it('starts the volume squat lighter than the heavy squat for an experienced lifter', () => {
    const exercises = buildCoreExercises('lb', 'some', 45);
    const heavy = exercises.find((e) => e.id === CORE_EXERCISE_IDS.squat);
    const volume = exercises.find((e) => e.id === CORE_EXERCISE_IDS.squatVolume);
    expect(volume!.startingWeight).toBeLessThan(heavy!.startingWeight);
  });

  it('gives every other core lift 5 sets of 5 reps', () => {
    const exercises = buildCoreExercises('lb', 'new', 45);
    const fiveByFive = exercises.filter((e) => e.name !== 'Deadlift' && e.id !== CORE_EXERCISE_IDS.squatVolume);
    for (const ex of fiveByFive) {
      expect(ex.defaultSets).toBe(5);
      expect(ex.defaultReps).toBe(5);
      expect(ex.repScheme).toBeNull();
    }
  });

  it('gives the two squats separate ids so their progression never crosses', () => {
    const exercises = buildCoreExercises('lb', 'some', 45);
    const ids = exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(CORE_EXERCISE_IDS.squat);
    expect(ids).toContain(CORE_EXERCISE_IDS.squatVolume);
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

describe('workSetRepTargets', () => {
  it('expands a uniform prescription across its sets', () => {
    expect(workSetRepTargets({ defaultSets: 5, defaultReps: 5, repScheme: null })).toEqual([5, 5, 5, 5, 5]);
    expect(workSetRepTargets({ defaultSets: 1, defaultReps: 5, repScheme: null })).toEqual([5]);
  });

  it('uses the scheme verbatim, and its length wins over defaultSets', () => {
    expect(workSetRepTargets({ defaultSets: 5, defaultReps: 5, repScheme: [12, 10, 8, 8] })).toEqual([12, 10, 8, 8]);
  });

  it('falls back to the uniform prescription for rows written before repScheme existed', () => {
    // Dexie hands back exactly what was stored, so the field is missing rather than null.
    const legacyRow = { defaultSets: 5, defaultReps: 5 } as { defaultSets: number; defaultReps: number; repScheme: number[] | null };
    expect(workSetRepTargets(legacyRow)).toEqual([5, 5, 5, 5, 5]);
  });

  it('does not hand out the shared scheme array for callers to mutate', () => {
    const targets = workSetRepTargets({ defaultSets: 4, defaultReps: 12, repScheme: VOLUME_SQUAT_REP_SCHEME });
    targets[0] = 99;
    expect(VOLUME_SQUAT_REP_SCHEME[0]).toBe(12);
  });
});

describe('repSchemeLabel', () => {
  it('writes uniform sets as NxM', () => {
    expect(repSchemeLabel({ defaultSets: 5, defaultReps: 5, repScheme: null })).toBe('5x5');
    expect(repSchemeLabel({ defaultSets: 1, defaultReps: 5, repScheme: null })).toBe('1x5');
  });

  it('writes a scheme as its rep targets in order', () => {
    expect(repSchemeLabel({ defaultSets: 4, defaultReps: 12, repScheme: [12, 10, 8, 8] })).toBe('12/10/8/8');
  });
});

describe('parseRepTargets', () => {
  it('reads a single number as a uniform prescription', () => {
    expect(parseRepTargets('5')).toEqual([5]);
  });

  it('reads slash, comma, and space separated schemes', () => {
    expect(parseRepTargets('12/10/8/8')).toEqual([12, 10, 8, 8]);
    expect(parseRepTargets('12, 10, 8, 8')).toEqual([12, 10, 8, 8]);
    expect(parseRepTargets(' 12 10 8 8 ')).toEqual([12, 10, 8, 8]);
  });

  it('rejects rather than silently dropping anything that is not a positive whole number', () => {
    expect(parseRepTargets('')).toBeNull();
    expect(parseRepTargets('12/abc/8')).toBeNull();
    expect(parseRepTargets('12/0/8')).toBeNull();
    expect(parseRepTargets('12/-8')).toBeNull();
    expect(parseRepTargets('12/8.5')).toBeNull();
  });
});

describe('volumeSquatWeightFor', () => {
  it('takes 65 percent of the heavy squat, rounded down to a loadable weight', () => {
    // 225 * 0.65 = 146.25, and 145 is the nearest loadable weight at or below it.
    expect(volumeSquatWeightFor(225, 45, LB_PLATES)).toBe(145);
    expect(volumeSquatWeightFor(135, 45, LB_PLATES)).toBe(85);
  });

  it('never drops below the bar', () => {
    expect(volumeSquatWeightFor(45, 45, LB_PLATES)).toBe(45);
  });
});

describe('buildVolumeSquatExercise', () => {
  it('carries the scheme and the seeded weight for an account that predates the split', () => {
    const volumeSquat = buildVolumeSquatExercise('lb', 45, volumeSquatWeightFor(225, 45, LB_PLATES));
    expect(volumeSquat.id).toBe(CORE_EXERCISE_IDS.squatVolume);
    expect(volumeSquat.isCore).toBe(true);
    expect(volumeSquat.repScheme).toEqual([12, 10, 8, 8]);
    expect(volumeSquat.loadScheme).toEqual([0.85, 0.9, 0.95, 1]);
    expect(volumeSquat.startingWeight).toBe(145);
    expect(volumeSquat.increment).toBe(5);
  });
});

describe('the volume squat load ramp', () => {
  it('is the only core lift that ramps; every other one is flat', () => {
    const exercises = buildCoreExercises('lb', 'some', 45);
    for (const ex of exercises) {
      if (ex.id === CORE_EXERCISE_IDS.squatVolume) expect(ex.loadScheme).toEqual(VOLUME_SQUAT_LOAD_SCHEME);
      else expect(ex.loadScheme).toBeNull();
    }
  });

  it('tops out at the tracked weight and never goes above it', () => {
    expect(VOLUME_SQUAT_LOAD_SCHEME[VOLUME_SQUAT_LOAD_SCHEME.length - 1]).toBe(1);
    for (const fraction of VOLUME_SQUAT_LOAD_SCHEME) expect(fraction).toBeLessThanOrEqual(1);
  });

  it('climbs as the reps come down, set for set', () => {
    expect(VOLUME_SQUAT_LOAD_SCHEME).toHaveLength(VOLUME_SQUAT_REP_SCHEME.length);
    for (let i = 1; i < VOLUME_SQUAT_LOAD_SCHEME.length; i++) {
      expect(VOLUME_SQUAT_LOAD_SCHEME[i]).toBeGreaterThanOrEqual(VOLUME_SQUAT_LOAD_SCHEME[i - 1]);
      expect(VOLUME_SQUAT_REP_SCHEME[i]).toBeLessThanOrEqual(VOLUME_SQUAT_REP_SCHEME[i - 1]);
    }
  });
});

describe('workSetWeights', () => {
  const flat = { defaultSets: 5, defaultReps: 5, repScheme: null, loadScheme: null, barWeight: 45 };
  const volumeSquat = {
    defaultSets: 4,
    defaultReps: 12,
    repScheme: VOLUME_SQUAT_REP_SCHEME,
    loadScheme: VOLUME_SQUAT_LOAD_SCHEME,
    barWeight: 45,
  };

  it('puts every work set at the prescribed weight when there is no ramp', () => {
    expect(workSetWeights(flat, 185, LB_PLATES)).toEqual([185, 185, 185, 185, 185]);
  });

  it('ramps the volume squat up to the tracked weight as its reps come down', () => {
    // 200 * [0.85, 0.9, 0.95, 1] = [170, 180, 190, 200], all loadable exactly.
    expect(workSetWeights(volumeSquat, 200, LB_PLATES)).toEqual([170, 180, 190, 200]);
  });

  it('makes the last set the tracked weight itself, so the top set never moves', () => {
    for (const top of [145, 185, 225, 315]) {
      const weights = workSetWeights(volumeSquat, top, LB_PLATES);
      expect(weights[weights.length - 1]).toBe(top);
    }
  });

  it('rounds each set down to a loadable weight rather than up', () => {
    // 145 * [0.85, 0.9, 0.95] = [123.25, 130.5, 137.75]; the minimum step is 5.
    expect(workSetWeights(volumeSquat, 145, LB_PLATES)).toEqual([120, 130, 135, 145]);
  });

  it('lets two sets share a weight rather than distorting the ramp near the bar', () => {
    // 50 * [0.85, 0.9, 0.95] = [42.5, 45, 47.5], all at or under the bar.
    expect(workSetWeights(volumeSquat, 50, LB_PLATES)).toEqual([45, 45, 45, 50]);
  });

  it('never prescribes less than the bar', () => {
    for (const w of workSetWeights(volumeSquat, 45, LB_PLATES)) expect(w).toBeGreaterThanOrEqual(45);
  });

  it('collapses to a flat load at the bar, where there is nowhere lighter to go', () => {
    expect(workSetWeights(volumeSquat, 45, LB_PLATES)).toEqual([45, 45, 45, 45]);
  });

  it('ignores a ramp whose length no longer matches the work sets', () => {
    // The rep prescription was edited to five sets under a four-entry ramp.
    const mismatched = { ...volumeSquat, repScheme: [12, 10, 8, 8, 8] };
    expect(workSetWeights(mismatched, 200, LB_PLATES)).toEqual([200, 200, 200, 200, 200]);
  });

  it('falls back to a flat load for rows written before loadScheme existed', () => {
    // Dexie hands back exactly what was stored, so the field is missing rather than null.
    const legacyRow = { defaultSets: 4, defaultReps: 12, repScheme: VOLUME_SQUAT_REP_SCHEME, barWeight: 45 } as Parameters<
      typeof workSetWeights
    >[0];
    expect(workSetWeights(legacyRow, 145, LB_PLATES)).toEqual([145, 145, 145, 145]);
  });

  it('works in kg, where the plate steps are finer', () => {
    const kgPlates = [20, 15, 10, 5, 2.5, 1.25];
    const kgSquat = { ...volumeSquat, barWeight: 20 };
    // 100 * [0.85, 0.9, 0.95] = [85, 90, 95], all loadable on a 2.5 kg step.
    expect(workSetWeights(kgSquat, 100, kgPlates)).toEqual([85, 90, 95, 100]);
  });
});

describe('hasLoadRamp', () => {
  const volumeSquat = {
    defaultSets: 4,
    defaultReps: 12,
    repScheme: VOLUME_SQUAT_REP_SCHEME,
    loadScheme: VOLUME_SQUAT_LOAD_SCHEME,
    barWeight: 45,
  };

  it('is false for a flat exercise', () => {
    expect(hasLoadRamp({ defaultSets: 5, defaultReps: 5, repScheme: null, loadScheme: null, barWeight: 45 }, 185, LB_PLATES)).toBe(
      false,
    );
  });

  it('is true once the ramp actually spreads the sets apart', () => {
    expect(hasLoadRamp(volumeSquat, 145, LB_PLATES)).toBe(true);
  });

  it('is false when the whole ramp rounds onto one weight at the bar', () => {
    expect(hasLoadRamp(volumeSquat, 45, LB_PLATES)).toBe(false);
  });
});
