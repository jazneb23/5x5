import type { PersonalRecord, Workout } from './types';

/** Epley formula. Section 9.5. */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return weight * (1 + reps / 30);
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

    const workSets = log.sets.filter((s) => !s.isWarmup && s.completedReps != null);
    if (workSets.length === 0) continue;

    const weight = log.prescribedWeight;
    const reps = workSets[0].targetReps;

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
