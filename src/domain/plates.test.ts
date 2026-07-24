import { describe, expect, it } from 'vitest';
import { calculatePlates, plateBreakdownForDisplay } from './plates';

const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

describe('calculatePlates', () => {
  it('targetWeight === barWeight returns an empty array and no warning', () => {
    expect(calculatePlates(45, 45, LB_PLATES)).toEqual({ plates: [], remainder: 0 });
  });

  it('185 lb on a 45 lb bar loads 45 + 25 per side (70 lb per side)', () => {
    expect(calculatePlates(185, 45, LB_PLATES)).toEqual({ plates: [45, 25], remainder: 0 });
  });

  it('135 lb on a 45 lb bar loads a single 45 per side', () => {
    expect(calculatePlates(135, 45, LB_PLATES)).toEqual({ plates: [45], remainder: 0 });
  });

  it('reports a non-zero remainder when the weight is not loadable', () => {
    // per side = 41.25, greedy fill leaves 1.25 unloaded with this inventory
    const result = calculatePlates(127.5, 45, LB_PLATES);
    expect(result.remainder).toBeCloseTo(2.5, 5);
  });

  it('an empty inventory reports the full per-side amount as remainder rather than throwing', () => {
    expect(calculatePlates(100, 45, [])).toEqual({ plates: [], remainder: 55 });
  });
});

describe('plateBreakdownForDisplay', () => {
  it('targetWeight < barWeight is invalid input and clamps to bar weight', () => {
    expect(plateBreakdownForDisplay(20, 45, LB_PLATES)).toEqual({ plates: [], remainder: 0 });
  });
});
