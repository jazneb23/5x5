import { describe, expect, it } from 'vitest';
import { convertAndRoundWeight, convertWeightValue } from './units';

describe('convertWeightValue', () => {
  it('is a no-op when units match', () => {
    expect(convertWeightValue(185, 'lb', 'lb')).toBe(185);
  });

  it('converts lb to kg', () => {
    expect(convertWeightValue(220.462, 'lb', 'kg')).toBeCloseTo(100, 1);
  });

  it('converts kg to lb', () => {
    expect(convertWeightValue(100, 'kg', 'lb')).toBeCloseTo(220.462, 1);
  });
});

describe('convertAndRoundWeight', () => {
  it('rounds converted lb->kg to the nearest 1.25 kg', () => {
    const result = convertAndRoundWeight(185, 'lb', 'kg');
    expect(result % 1.25).toBeCloseTo(0, 5);
  });

  it('rounds converted kg->lb to the nearest 2.5 lb', () => {
    const result = convertAndRoundWeight(100, 'kg', 'lb');
    expect(result % 2.5).toBeCloseTo(0, 5);
  });
});
