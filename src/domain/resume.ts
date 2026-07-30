import type { Workout } from './types';

// Reopening a session that was already finished. A session gets marked
// complete with work still on the table — an exercise skipped, or simply
// never logged before the finish button — and the user comes back a day
// later to do it. Reopening puts that session back in progress instead of
// starting a new one.
//
// Pure rules only. The rollback and re-finish live in state/useAppStore.

export type UnfinishedReason =
  | 'skipped' // deliberately skipped during the session
  | 'unlogged' // no work set was ever logged
  | 'partial'; // some work sets logged, some not

export interface UnfinishedExercise {
  exerciseId: string;
  reason: UnfinishedReason;
}

/**
 * The exercises in a session that still have work left. Warmup sets are
 * ignored entirely — they never decide whether an exercise counts as done.
 * An exercise whose work sets are all logged is finished regardless of
 * whether it passed or failed: a failed exercise is a result, not an
 * omission.
 */
export function unfinishedExercises(workout: Workout): UnfinishedExercise[] {
  const unfinished: UnfinishedExercise[] = [];

  for (const log of workout.exercises) {
    if (log.skipped) {
      unfinished.push({ exerciseId: log.exerciseId, reason: 'skipped' });
      continue;
    }
    const workSets = log.sets.filter((s) => !s.isWarmup);
    if (workSets.length === 0) continue;
    const loggedCount = workSets.filter((s) => s.completedReps != null).length;
    if (loggedCount === 0) unfinished.push({ exerciseId: log.exerciseId, reason: 'unlogged' });
    else if (loggedCount < workSets.length) unfinished.push({ exerciseId: log.exerciseId, reason: 'partial' });
  }

  return unfinished;
}

/** The newest completed session by completion time, or null when there is none. */
export function mostRecentCompletedWorkout(workouts: Workout[]): Workout | null {
  let newest: Workout | null = null;
  for (const w of workouts) {
    if (w.completedAt == null) continue;
    if (newest == null || w.completedAt > (newest.completedAt as number)) newest = w;
  }
  return newest;
}

/**
 * Only the newest completed session can be reopened, and only while nothing
 * else is in progress.
 *
 * Both limits are load-bearing. Reopening rolls progression back by replaying
 * every other completed session, which lands on the state that session
 * started from only when it is the newest one. And the app holds exactly one
 * in-progress session at a time.
 */
export function canResumeWorkout(workout: Workout, allWorkouts: Workout[]): boolean {
  if (workout.completedAt == null) return false;
  if (allWorkouts.some((w) => w.completedAt == null)) return false;
  return mostRecentCompletedWorkout(allWorkouts)?.id === workout.id;
}

/** How long after finishing a session Today keeps offering to resume it. */
export const RESUME_PROMPT_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ResumePrompt {
  workout: Workout;
  unfinished: UnfinishedExercise[];
}

/**
 * What Today offers to pick back up: the newest completed session, when it
 * can still be reopened, was finished inside the window, and left work
 * undone. Older sessions stay resumable from History — they just stop
 * pushing themselves at the user.
 */
export function resumePrompt(
  allWorkouts: Workout[],
  now: number,
  windowMs: number = RESUME_PROMPT_WINDOW_MS,
): ResumePrompt | null {
  const workout = mostRecentCompletedWorkout(allWorkouts);
  if (!workout) return null;
  if (!canResumeWorkout(workout, allWorkouts)) return null;
  if (now - (workout.completedAt as number) > windowMs) return null;

  const unfinished = unfinishedExercises(workout);
  return unfinished.length > 0 ? { workout, unfinished } : null;
}
