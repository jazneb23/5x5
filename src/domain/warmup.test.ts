import { describe, expect, it } from 'vitest';
import { generateWarmupSets } from './warmup';

const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

describe('generateWarmupSets', () => {
  it('prescribes two sets of five at the floor when the work weight is at or near the floor', () => {
    const sets = generateWarmupSets(45, 45, 45, LB_PLATES);
    expect(sets).toEqual([
      { setIndex: 0, targetReps: 5, weight: 45 },
      { setIndex: 1, targetReps: 5, weight: 45 },
    ]);
  });

  it('prescribes two sets at the floor when work weight is within one minimum step of the floor', () => {
    // step = 5, floor = 45 -> W <= 50 collapses to the two-set case
    const sets = generateWarmupSets(50, 45, 45, LB_PLATES);
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.weight === 45)).toBe(true);
  });

  it('builds the full ramp for a heavier work weight', () => {
    // W=185, F=45, B=45: ramp at 0.4/0.6/0.8 of (185-45)=140 -> 56,84,112 offsets
    // -> 101, 129, 157 rounded down to loadable 5s -> 100, 125, 155
    const sets = generateWarmupSets(185, 45, 45, LB_PLATES);
    expect(sets.map((s) => s.weight)).toEqual([45, 45, 100, 125, 155]);
    expect(sets.map((s) => s.targetReps)).toEqual([5, 5, 5, 3, 2]);
  });

  it('drops any ramp set whose weight is not strictly greater than the previous one, keeping the two floor sets intact', () => {
    // A very small ramp range can produce ties after rounding; those collapse.
    const sets = generateWarmupSets(65, 45, 45, LB_PLATES);
    expect(sets[0].weight).toBe(45);
    expect(sets[1].weight).toBe(45);
    const rampWeights = sets.slice(2).map((s) => s.weight);
    for (let i = 1; i < rampWeights.length; i++) {
      expect(rampWeights[i]).toBeGreaterThan(rampWeights[i - 1]);
    }
  });

  it('uses the deadlift floor of 95 lb', () => {
    const sets = generateWarmupSets(225, 45, 95, LB_PLATES);
    expect(sets[0].weight).toBe(95);
  });
});
