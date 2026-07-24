import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import * as repo from '../../data/repository';
import { ScreenHeader } from '../../components/ScreenHeader';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(startedAt: number, completedAt: number): string {
  const minutes = Math.round((completedAt - startedAt) / 60000);
  return `${minutes} min`;
}

export function HistoryListScreen() {
  const workouts = useLiveQuery(() => repo.getAllWorkouts(), []);
  const completed = (workouts ?? []).filter((w) => w.completedAt != null);

  return (
    <div>
      <ScreenHeader title="History" showSettings />
      <div className="px-5 pb-6">
        {completed.length === 0 ? (
          <p className="text-body text-chalk-500">No workouts logged yet.</p>
        ) : (
          <div className="divide-y divide-iron-800">
            {completed.map((w) => (
              <Link key={w.id} to={`/history/${w.id}`} className="flex items-center justify-between py-4">
                <div>
                  <div className="text-body text-chalk-100">
                    {formatDate(w.startedAt)} <span className="text-chalk-500">{w.type}</span>
                  </div>
                  <div className="text-data text-chalk-500">{formatDuration(w.startedAt, w.completedAt as number)}</div>
                </div>
                <div className="flex gap-1.5">
                  {w.exercises.map((e) => (
                    <span key={e.exerciseId} className={`h-2.5 w-2.5 rounded-full ${e.succeeded ? 'bg-chalk-100' : 'border border-fail'}`} />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
