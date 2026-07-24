import { Fragment } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import * as repo from '../../data/repository';
import { nextWorkoutType, WORKOUT_TEMPLATES } from '../../domain/program';
import type { WorkoutType } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PlateStrip } from '../../components/PlateStrip';
import { Button } from '../../components/Button';
import { unlockAudioContext, requestNotificationPermission } from '../../state/timerEffects';

function formatElapsed(startedAt: number): string {
  const minutes = Math.floor((Date.now() - startedAt) / 60000);
  if (minutes < 1) return 'just started';
  if (minutes === 1) return '1 min in';
  return `${minutes} min in`;
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

export function TodayScreen() {
  const navigate = useNavigate();
  const exercises = useAppStore((s) => s.exercises);
  const exerciseStates = useAppStore((s) => s.exerciseStates);
  const settings = useAppStore((s) => s.settings);
  const currentWorkout = useAppStore((s) => s.currentWorkout);
  const startWorkout = useAppStore((s) => s.startWorkout);

  const workouts = useLiveQuery(() => repo.getAllWorkouts(), []);

  if (!workouts) {
    return <div className="px-5 py-6 text-chalk-500">Loading…</div>;
  }

  const completed = workouts.filter((w) => w.completedAt != null);
  const lastCompleted = completed[0];
  const nextType: WorkoutType =
    lastCompleted && lastCompleted.type !== 'custom' ? nextWorkoutType(lastCompleted.type) : nextWorkoutType(null);

  const coreIds = WORKOUT_TEMPLATES[nextType];
  const nextExercises = coreIds
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const customForNext = exercises
    .filter((e) => !e.isCore && !e.archived && (e.assignment === nextType || e.assignment === 'both'))
    .sort((a, b) => a.order - b.order);
  const allNext = [...nextExercises, ...customForNext];

  async function handleStart() {
    unlockAudioContext();
    if (settings.notificationsEnabled) await requestNotificationPermission();
    await startWorkout(nextType);
    navigate('/workout');
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const shouldPromptExport =
    completed.length > 0 && (settings.lastExportAt == null || Date.now() - settings.lastExportAt > THIRTY_DAYS_MS);

  return (
    <div>
      <ScreenHeader title="Today" showSettings />
      <div className="px-5 pb-6">
        {shouldPromptExport && (
          <Link
            to="/settings"
            className="mb-4 block rounded-md border border-iron-700 bg-iron-900 px-4 py-3 text-data text-chalk-300"
          >
            It has been over 30 days since your last export. Back up your data in Settings.
          </Link>
        )}
        <div className="rounded-lg border border-iron-700 bg-iron-900 p-5">
          <p className="mb-1 text-label uppercase tracking-[0.12em] text-chalk-500">
            {currentWorkout ? 'In progress' : 'Next workout'}
          </p>
          <p className="mb-4 font-display text-display-md text-signal">{currentWorkout ? currentWorkout.type : nextType}</p>

          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
            {(currentWorkout ? currentWorkout.exercises : allNext).map((item, index) => {
              const exerciseId = 'exerciseId' in item ? item.exerciseId : item.id;
              const exercise = exercises.find((e) => e.id === exerciseId);
              if (!exercise) return null;
              const weight =
                'prescribedWeight' in item ? item.prescribedWeight : exerciseStates[exercise.id]?.currentWeight ?? exercise.startingWeight;
              const borderClass = index > 0 ? 'border-t border-iron-800' : '';
              return (
                <Fragment key={exerciseId}>
                  <span className={`py-3 text-body text-chalk-100 ${borderClass}`}>{exercise.name}</span>
                  <div className={`flex items-center justify-end py-3 ${borderClass}`}>
                    {exercise.kind === 'barbell' && exercise.barWeight != null && (
                      <PlateStrip
                        targetWeight={weight}
                        barWeight={exercise.barWeight}
                        availablePlates={settings.availablePlates}
                        unit={settings.unit}
                        size="sm"
                      />
                    )}
                  </div>
                  <span className={`py-3 text-right font-display text-weight-lg text-chalk-100 ${borderClass}`}>
                    {weight}
                    <span className="ml-1 text-label text-chalk-500">{settings.unit.toUpperCase()}</span>
                  </span>
                </Fragment>
              );
            })}
          </div>

          <div className="mt-5">
            {currentWorkout ? (
              <Button onClick={() => navigate('/workout')}>Resume workout · {formatElapsed(currentWorkout.startedAt)}</Button>
            ) : (
              <Button onClick={handleStart}>Start workout</Button>
            )}
          </div>
        </div>

        <div className="mt-8">
          <p className="mb-2 text-label uppercase tracking-[0.12em] text-chalk-500">Recent</p>
          {completed.length === 0 ? (
            <p className="text-body text-chalk-500">No workouts logged yet.</p>
          ) : (
            <div className="space-y-3">
              {completed.slice(0, 3).map((w) => (
                <div key={w.id} className="flex items-center justify-between">
                  <span className="text-data text-chalk-300">{formatShortDate(w.completedAt as number)}</span>
                  <span className="text-body-strong text-chalk-100">{w.type}</span>
                  <div className="flex gap-1.5">
                    {w.exercises.map((e) => (
                      <span
                        key={e.exerciseId}
                        className={`h-2.5 w-2.5 rounded-full ${
                          e.succeeded ? 'bg-chalk-100' : 'border border-fail'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="pt-1 text-data text-chalk-500">
                {daysSince(completed[0].completedAt as number) === 0
                  ? 'Trained today.'
                  : `Last trained ${daysSince(completed[0].completedAt as number)} day${daysSince(completed[0].completedAt as number) === 1 ? '' : 's'} ago.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
