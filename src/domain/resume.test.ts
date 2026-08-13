import { describe, expect, it } from 'vitest';
import {
  canResumeWorkout,
  mostRecentCompletedWorkout,
  resumePrompt,
  RESUME_PROMPT_WINDOW_MS,
  unfinishedExercises,
} from './resume';
import type { ExerciseLog, SetLog, Workout } from './types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

function workSet(setIndex: number, completedReps: number | null): SetLog {
  return { setIndex, targetReps: 5, completedReps, weight: 185, isWarmup: false, loggedAt: completedReps == null ? null : NOW };
}

function warmupSet(setIndex: number, completedReps: number | null): SetLog {
  return { setIndex, targetReps: 5, completedReps, weight: 95, isWarmup: true, loggedAt: completedReps == null ? null : NOW };
}

function log(exerciseId: string, sets: SetLog[], overrides: Partial<ExerciseLog> = {}): ExerciseLog {
  return { exerciseId, order: 0, prescribedWeight: 185, sets, succeeded: null, note: null, skipped: false, ...overrides };
}

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    type: 'A',
    startedAt: NOW - DAY,
    completedAt: NOW - DAY + HOUR,
    exercises: [],
    bodyweight: null,
    note: null,
    ...overrides,
  };
}

const FULL = [workSet(0, 5), workSet(1, 5), workSet(2, 5), workSet(3, 5), workSet(4, 5)];
const NONE = [workSet(0, null), workSet(1, null), workSet(2, null), workSet(3, null), workSet(4, null)];

describe('unfinishedExercises', () => {
  it('finds nothing in a session where every work set was logged', () => {
    const w = workout({ exercises: [log('squat', FULL), log('bench', FULL)] });
    expect(unfinishedExercises(w)).toEqual([]);
  });

  it('reports an exercise no work set was ever logged for', () => {
    const w = workout({ exercises: [log('squat', FULL), log('bench', NONE)] });
    expect(unfinishedExercises(w)).toEqual([{ exerciseId: 'bench', reason: 'unlogged' }]);
  });

  it('reports an exercise only some of whose work sets were logged', () => {
    const w = workout({ exercises: [log('bench', [workSet(0, 5), workSet(1, 5), workSet(2, null)])] });
    expect(unfinishedExercises(w)).toEqual([{ exerciseId: 'bench', reason: 'partial' }]);
  });

  it('reports a skipped exercise', () => {
    const w = workout({ exercises: [log('bench', NONE, { skipped: true, note: 'shoulder' })] });
    expect(unfinishedExercises(w)).toEqual([{ exerciseId: 'bench', reason: 'skipped' }]);
  });

  it('treats a failed exercise as finished — a result is not an omission', () => {
    const w = workout({ exercises: [log('bench', [workSet(0, 5), workSet(1, 3), workSet(2, 0)])] });
    expect(unfinishedExercises(w)).toEqual([]);
  });

  it('ignores warmup sets when deciding whether an exercise is done', () => {
    const finished = workout({ exercises: [log('bench', [warmupSet(0, null), warmupSet(1, null), workSet(2, 5)])] });
    expect(unfinishedExercises(finished)).toEqual([]);

    const started = workout({ exercises: [log('bench', [warmupSet(0, 5), workSet(1, null)])] });
    expect(unfinishedExercises(started)).toEqual([{ exerciseId: 'bench', reason: 'unlogged' }]);
  });

  it('reports every unfinished exercise, in session order', () => {
    const w = workout({
      exercises: [log('squat', NONE), log('bench', FULL), log('row', NONE, { skipped: true })],
    });
    expect(unfinishedExercises(w)).toEqual([
      { exerciseId: 'squat', reason: 'unlogged' },
      { exerciseId: 'row', reason: 'skipped' },
    ]);
  });
});

describe('mostRecentCompletedWorkout', () => {
  it('is null when nothing has been completed', () => {
    expect(mostRecentCompletedWorkout([])).toBeNull();
    expect(mostRecentCompletedWorkout([workout({ completedAt: null })])).toBeNull();
  });

  it('picks the newest completion time regardless of list order', () => {
    const older = workout({ id: 'old', completedAt: NOW - 5 * DAY });
    const newer = workout({ id: 'new', completedAt: NOW - DAY });
    expect(mostRecentCompletedWorkout([older, newer])?.id).toBe('new');
    expect(mostRecentCompletedWorkout([newer, older])?.id).toBe('new');
  });
});

describe('canResumeWorkout', () => {
  const older = workout({ id: 'old', completedAt: NOW - 5 * DAY });
  const newest = workout({ id: 'new', completedAt: NOW - DAY });

  it('allows the newest completed session', () => {
    expect(canResumeWorkout(newest, [older, newest])).toBe(true);
  });

  it('refuses an older session, whose rollback would be wrong', () => {
    expect(canResumeWorkout(older, [older, newest])).toBe(false);
  });

  it('refuses while another session is in progress', () => {
    const inProgress = workout({ id: 'live', completedAt: null });
    expect(canResumeWorkout(newest, [older, newest, inProgress])).toBe(false);
  });

  it('refuses a session that is already in progress', () => {
    const reopened = workout({ id: 'new', completedAt: null, completedAtBeforeResume: NOW - DAY });
    expect(canResumeWorkout(reopened, [older, reopened])).toBe(false);
  });
});

describe('resumePrompt', () => {
  it('offers the last session when an exercise was never logged', () => {
    const w = workout({ completedAt: NOW - DAY, exercises: [log('squat', FULL), log('bench', NONE)] });
    const prompt = resumePrompt([w], NOW);
    expect(prompt?.workout.id).toBe('w1');
    expect(prompt?.unfinished).toEqual([{ exerciseId: 'bench', reason: 'unlogged' }]);
  });

  it('stays quiet when the session was fully logged', () => {
    const w = workout({ completedAt: NOW - DAY, exercises: [log('squat', FULL), log('bench', FULL)] });
    expect(resumePrompt([w], NOW)).toBeNull();
  });

  it('stays quiet when the only thing left was deliberately skipped', () => {
    const w = workout({
      completedAt: NOW - DAY,
      exercises: [log('squat', FULL), log('bench', NONE, { skipped: true, note: 'shoulder' })],
    });
    expect(resumePrompt([w], NOW)).toBeNull();
  });

  it('stays quiet when every exercise was skipped', () => {
    const w = workout({
      completedAt: NOW - DAY,
      exercises: [log('squat', NONE, { skipped: true }), log('bench', NONE, { skipped: true })],
    });
    expect(resumePrompt([w], NOW)).toBeNull();
  });

  it('offers a session with unlogged work, and names the skips on it too', () => {
    const w = workout({
      completedAt: NOW - DAY,
      exercises: [log('squat', NONE, { skipped: true }), log('bench', NONE), log('row', FULL)],
    });
    expect(resumePrompt([w], NOW)?.unfinished).toEqual([
      { exerciseId: 'squat', reason: 'skipped' },
      { exerciseId: 'bench', reason: 'unlogged' },
    ]);
  });

  it('offers a session left partly logged alongside a skip', () => {
    const w = workout({
      completedAt: NOW - DAY,
      exercises: [log('squat', [workSet(0, 5), workSet(1, null)]), log('bench', NONE, { skipped: true })],
    });
    expect(resumePrompt([w], NOW)?.unfinished).toEqual([
      { exerciseId: 'squat', reason: 'partial' },
      { exerciseId: 'bench', reason: 'skipped' },
    ]);
  });

  it('stays quiet once the session falls outside the window', () => {
    const w = workout({ completedAt: NOW - RESUME_PROMPT_WINDOW_MS - HOUR, exercises: [log('bench', NONE)] });
    expect(resumePrompt([w], NOW)).toBeNull();
    expect(resumePrompt([w], NOW, 7 * DAY)?.workout.id).toBe('w1');
  });

  it('stays quiet when the unfinished session is no longer the newest one', () => {
    const unfinished = workout({ id: 'old', completedAt: NOW - DAY, exercises: [log('bench', NONE)] });
    const newer = workout({ id: 'new', completedAt: NOW - HOUR, exercises: [log('squat', FULL)] });
    expect(resumePrompt([unfinished, newer], NOW)).toBeNull();
  });

  it('stays quiet while a session is in progress', () => {
    const w = workout({ completedAt: NOW - DAY, exercises: [log('bench', NONE)] });
    const live = workout({ id: 'live', completedAt: null });
    expect(resumePrompt([w, live], NOW)).toBeNull();
  });

  it('offers nothing when there is no history at all', () => {
    expect(resumePrompt([], NOW)).toBeNull();
  });
});
