import type { PlateBreakdown } from './types';

const EPSILON = 1e-6;

/**
 * Greedy descending fill of one side of the bar from the available plate
 * inventory, allowing repeats. Returns plates heaviest-first plus a
 * remainder: a non-zero remainder means the target is not loadable with the
 * current inventory and the UI must show it as a warning, never silently
 * round.
 */
export function calculatePlates(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[],
): PlateBreakdown {
  if (targetWeight <= barWeight + EPSILON) {
    return { plates: [], remainder: 0 };
  }

  let perSide = (targetWeight - barWeight) / 2;
  const sorted = [...availablePlates].filter((p) => p > 0).sort((a, b) => b - a);
  const plates: number[] = [];

  for (const plate of sorted) {
    while (perSide + EPSILON >= plate) {
      plates.push(plate);
      perSide -= plate;
    }
  }

  const remainder = perSide > EPSILON ? round2(perSide * 2) : 0;
  return { plates, remainder };
}

/**
 * Clamps below-bar targets to the bar weight per section 6's edge cases,
 * then delegates to calculatePlates.
 */
export function plateBreakdownForDisplay(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[],
): PlateBreakdown {
  const clamped = Math.max(targetWeight, barWeight);
  return calculatePlates(clamped, barWeight, availablePlates);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
