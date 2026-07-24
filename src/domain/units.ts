import type { Unit } from './types';

const LB_PER_KG = 2.2046226218;

/** Raw unit conversion, no rounding. */
export function convertWeightValue(weight: number, from: Unit, to: Unit): number {
  if (from === to) return weight;
  return from === 'lb' ? weight / LB_PER_KG : weight * LB_PER_KG;
}

/**
 * Section 12 edge case: switching units converts stored values rather than
 * re-measuring them. Rounds to the nearest half-step of the target unit's
 * typical increment (5 lb / 2.5 kg) so converted numbers land on ordinary
 * loadable weights instead of odd decimals.
 */
export function convertAndRoundWeight(weight: number, from: Unit, to: Unit): number {
  const converted = convertWeightValue(weight, from, to);
  const step = to === 'lb' ? 2.5 : 1.25;
  return Math.round(converted / step) * step;
}

export const STANDARD_BAR_WEIGHT: Record<Unit, number> = { lb: 45, kg: 20 };
export const STANDARD_PLATES: Record<Unit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};
