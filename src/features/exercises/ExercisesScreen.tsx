import { Link } from 'react-router-dom';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';

export function ExercisesScreen() {
  const exercises = useAppStore((s) => s.exercises);
  const exerciseStates = useAppStore((s) => s.exerciseStates);
  const settings = useAppStore((s) => s.settings);
  const restoreExercise = useAppStore((s) => s.restoreExercise);

  const core = exercises.filter((e) => e.isCore);
  const custom = exercises.filter((e) => !e.isCore && !e.archived);
  const archived = exercises.filter((e) => !e.isCore && e.archived);

  return (
    <div>
      <ScreenHeader title="Exercises" showSettings />
      <div className="px-5 pb-6">
        <p className="mb-2 text-label uppercase tracking-[0.12em] text-chalk-500">Core lifts</p>
        <div className="mb-6 divide-y divide-iron-800">
          {core.map((e) => (
            <Link key={e.id} to={`/exercises/${e.id}`} className="flex items-center justify-between py-3">
              <span className="text-body text-chalk-100">{e.name}</span>
              <span className="font-mono text-data text-chalk-500">
                {exerciseStates[e.id]?.currentWeight ?? e.startingWeight} {settings.unit.toUpperCase()}
              </span>
            </Link>
          ))}
        </div>

        <p className="mb-2 text-label uppercase tracking-[0.12em] text-chalk-500">Custom</p>
        {custom.length === 0 ? (
          <p className="mb-6 text-body text-chalk-500">No custom exercises yet.</p>
        ) : (
          <div className="mb-6 divide-y divide-iron-800">
            {custom.map((e) => (
              <Link key={e.id} to={`/exercises/${e.id}`} className="flex items-center justify-between py-3">
                <span className="text-body text-chalk-100">{e.name}</span>
                <span className="font-mono text-data text-chalk-500">
                  {exerciseStates[e.id]?.currentWeight ?? e.startingWeight} {settings.unit.toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <>
            <p className="mb-2 text-label uppercase tracking-[0.12em] text-chalk-500">Archived</p>
            <div className="mb-6 divide-y divide-iron-800">
              {archived.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-3">
                  <span className="text-body text-chalk-500">{e.name}</span>
                  <button type="button" onClick={() => restoreExercise(e.id)} className="text-data text-signal">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <Link to="/exercises/new">
          <Button variant="secondary">New exercise</Button>
        </Link>
      </div>
    </div>
  );
}
