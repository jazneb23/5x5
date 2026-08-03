import type { PersonalRecord, SetLog, Workout } from './types';

/** Epley formula. Section 9.5. */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/**
 * The heaviest work set in a log, with the reps it was actually prescribed
 * for. Ties break toward the higher rep target, which is the harder set and
 * the better estimated 1RM.
 *
 * A flat exercise has one weight across every work set, so this is just "the
 * weight, at its rep target". A ramped one — the volume squat — does not: its
 * top set is eight reps while its first is twelve, and pairing the top weight
 * with the first set's rep target would credit twelve reps at a weight that
 * was never lifted for twelve.
 */
function heaviestWorkSet(sets: SetLog[]): SetLog | null {
  const workSets = sets.filter((s) => !s.isWarmup && s.completedReps != null);
  if (workSets.length === 0) return null;
  return workSets.reduce((best, s) =>
    s.weight > best.weight || (s.weight === best.weight && s.targetReps > best.targetReps) ? s : best,
  );
}

/**
 * Derives personal records from completed workout history for one exercise:
 * the best fully-successful work-set weight seen so far, tracked
 * chronologically so each new best becomes a record event. Ties are not
 * records; only a strict improvement is.
 */
export function derivePersonalRecords(workouts: Workout[], exerciseId: string): PersonalRecord[] {
  const completed = workouts
    .filter((w) => w.completedAt != null)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  const records: PersonalRecord[] = [];
  let best = 0;

  for (const workout of completed) {
    const log = workout.exercises.find((e) => e.exerciseId === exerciseId);
    if (!log || log.succeeded !== true) continue;

    const top = heaviestWorkSet(log.sets);
    if (!top) continue;

    const weight = top.weight;
    const reps = top.targetReps;

    if (weight > best) {
      best = weight;
      records.push({
        exerciseId,
        workoutId: workout.id,
        at: workout.completedAt as number,
        weight,
        reps,
        estimated1RM: estimated1RM(weight, reps),
      });
    }
  }

  return records;
}

export function allTimeBest(workouts: Workout[], exerciseId: string): PersonalRecord | null {
  const records = derivePersonalRecords(workouts, exerciseId);
  return records.length > 0 ? records[records.length - 1] : null;
}
