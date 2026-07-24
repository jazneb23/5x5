import type { WarmupSet } from './types';
import { minimumStep, roundDownToLoadable } from './progression';

/**
 * Deterministic warmup set generation. Section 7. Warmup sets never affect
 * progression and are always optional to log.
 */
export function generateWarmupSets(
  workWeight: number,
  barWeight: number,
  floor: number,
  availablePlates: number[],
): WarmupSet[] {
  const step = minimumStep(availablePlates);
  const round = (w: number) => roundDownToLoadable(w, barWeight, availablePlates);

  if (workWeight <= floor + step) {
    return [
      { setIndex: 0, targetReps: 5, weight: floor },
      { setIndex: 1, targetReps: 5, weight: floor },
    ];
  }

  // The two floor sets are always kept even though they share a weight ("2
  // sets of 5 at F" is explicit in the spec); only the ramp above them dedupes.
  const kept: Omit<WarmupSet, 'setIndex'>[] = [
    { targetReps: 5, weight: floor },
    { targetReps: 5, weight: floor },
  ];

  const ramp: Omit<WarmupSet, 'setIndex'>[] = [
    { targetReps: 5, weight: round(floor + 0.4 * (workWeight - floor)) },
    { targetReps: 3, weight: round(floor + 0.6 * (workWeight - floor)) },
    { targetReps: 2, weight: round(floor + 0.8 * (workWeight - floor)) },
  ];

  let previousWeight = floor;
  for (const set of ramp) {
    if (set.weight <= previousWeight) continue;
    kept.push(set);
    previousWeight = set.weight;
  }

  return kept.map((set, setIndex) => ({ ...set, setIndex }));
}
