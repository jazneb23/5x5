import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import * as repo from '../../data/repository';
import { ScreenHeader } from '../../components/ScreenHeader';
import { HistoryCalendarView } from './HistoryCalendarView';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(startedAt: number, completedAt: number): string {
  const minutes = Math.round((completedAt - startedAt) / 60000);
  return `${minutes} min`;
}

type View = 'list' | 'calendar';

export function HistoryListScreen() {
  const navigate = useNavigate();
  const workouts = useLiveQuery(() => repo.getAllWorkouts(), []);
  const completed = (workouts ?? []).filter((w) => w.completedAt != null);
  const [view, setView] = useState<View>('list');

  return (
    <div>
      <ScreenHeader
        title="History"
        showSettings
        right={
          <div className="flex rounded-sm border border-iron-700 text-label uppercase tracking-[0.12em]">
            {(['list', 'calendar'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 ${view === v ? 'bg-iron-800 text-chalk-100' : 'text-chalk-500'}`}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-5 pb-6">
        {completed.length === 0 ? (
          <p className="text-body text-chalk-500">No workouts logged yet.</p>
        ) : view === 'calendar' ? (
          <HistoryCalendarView workouts={completed} onSelectWorkout={(id) => navigate(`/history/${id}`)} />
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
