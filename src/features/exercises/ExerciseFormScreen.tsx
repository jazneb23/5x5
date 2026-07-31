import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseRepTargets, workSetRepTargets } from '../../domain/program';
import type { Exercise, ExerciseKind, ProgressionScheme, WorkoutAssignment } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';

const KINDS: { value: ExerciseKind; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'machine', label: 'Machine' },
  { value: 'timed', label: 'Timed' },
  { value: 'distance', label: 'Distance' },
];

const PROGRESSIONS: { value: ProgressionScheme; label: string }[] = [
  { value: 'linear', label: 'Linear (auto progression)' },
  { value: 'manual', label: 'Manual (you set the weight)' },
  { value: 'none', label: 'None (no weight tracked)' },
];

const ASSIGNMENTS: { value: WorkoutAssignment; label: string }[] = [
  { value: 'none', label: 'Unattached' },
  { value: 'A', label: 'Workout A' },
  { value: 'B', label: 'Workout B' },
  { value: 'both', label: 'Both workouts' },
];

export function ExerciseFormScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exercises = useAppStore((s) => s.exercises);
  const exerciseStates = useAppStore((s) => s.exerciseStates);
  const settings = useAppStore((s) => s.settings);
  const createExercise = useAppStore((s) => s.createExercise);
  const updateExercise = useAppStore((s) => s.updateExercise);
  const archiveExercise = useAppStore((s) => s.archiveExercise);
  const setExerciseCurrentWeight = useAppStore((s) => s.setExerciseCurrentWeight);

  const existing = id ? exercises.find((e) => e.id === id) : undefined;
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<ExerciseKind>(existing?.kind ?? 'barbell');
  const [defaultSets, setDefaultSets] = useState(existing?.defaultSets ?? 5);
  // One number for uniform sets, or one per set ("12/10/8/8") for a scheme
  // like the volume squat's.
  const [repsText, setRepsText] = useState(() => initialRepsText(existing));
  const [startingWeight, setStartingWeight] = useState(existing?.startingWeight ?? 45);
  const [increment, setIncrement] = useState(existing?.increment ?? 5);
  const [progression, setProgression] = useState<ProgressionScheme>(existing?.progression ?? 'linear');
  const [barWeight, setBarWeight] = useState(existing?.barWeight ?? settings.barWeight);
  const [assignment, setAssignment] = useState<WorkoutAssignment>(existing?.assignment ?? 'none');
  const [currentWeight, setCurrentWeight] = useState(
    existing ? exerciseStates[existing.id]?.currentWeight ?? existing.startingWeight : startingWeight,
  );
  const [confirmArchive, setConfirmArchive] = useState(false);

  const repTargets = parseRepTargets(repsText);
  const perSetReps = repTargets != null && repTargets.length > 1;
  // A per-set list carries its own set count; a single number leaves the sets
  // field in charge.
  const effectiveSets = perSetReps ? (repTargets as number[]).length : defaultSets;

  async function handleSave() {
    if (repTargets == null) return;
    const shape = {
      defaultSets: effectiveSets,
      defaultReps: repTargets[0],
      repScheme: perSetReps ? repTargets : null,
    };
    if (isNew) {
      await createExercise({
        name,
        kind,
        ...shape,
        startingWeight,
        increment,
        progression,
        barWeight: kind === 'barbell' ? barWeight : null,
        assignment,
      });
    } else if (existing) {
      await updateExercise({
        ...existing,
        name,
        kind,
        ...shape,
        increment,
        progression,
        barWeight: kind === 'barbell' ? barWeight : null,
        assignment: existing.isCore ? existing.assignment : assignment,
      });
      await setExerciseCurrentWeight(existing.id, currentWeight);
    }
    navigate('/exercises');
  }

  return (
    <div>
      <ScreenHeader title={isNew ? 'New exercise' : existing!.name} showBack />
      <div className="space-y-5 px-5 pb-6">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={existing?.isCore}
            className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 text-body text-chalk-100 disabled:opacity-50"
          />
        </Field>

        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExerciseKind)}
            disabled={existing?.isCore}
            className="w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100 disabled:opacity-50"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sets">
            <input
              type="number"
              value={effectiveSets}
              disabled={perSetReps}
              onChange={(e) => setDefaultSets(Number(e.target.value))}
              className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100 disabled:opacity-50"
            />
          </Field>
          <Field label="Reps">
            <input
              value={repsText}
              inputMode="numeric"
              onChange={(e) => setRepsText(e.target.value)}
              className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
            />
          </Field>
        </div>
        <p className={`-mt-3 text-label ${repTargets == null ? 'text-fail' : 'text-chalk-500'}`}>
          {repTargets == null
            ? 'Reps must be whole numbers — one for every set, or one per set.'
            : 'One number for every set, or one per set: 12/10/8/8.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isNew ? 'Starting weight' : 'Current weight'}>
            <input
              type="number"
              value={isNew ? startingWeight : currentWeight}
              onChange={(e) => (isNew ? setStartingWeight(Number(e.target.value)) : setCurrentWeight(Number(e.target.value)))}
              className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
            />
          </Field>
          <Field label="Increment">
            <input
              type="number"
              value={increment}
              onChange={(e) => setIncrement(Number(e.target.value))}
              className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
            />
          </Field>
        </div>

        {kind === 'barbell' && (
          <Field label="Bar weight">
            <input
              type="number"
              value={barWeight ?? 0}
              onChange={(e) => setBarWeight(Number(e.target.value))}
              className="w-full rounded-sm border border-iron-700 bg-transparent px-3 py-3 font-mono text-body text-chalk-100"
            />
          </Field>
        )}

        <Field label="Progression">
          <select
            value={progression}
            onChange={(e) => setProgression(e.target.value as ProgressionScheme)}
            className="w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100"
          >
            {PROGRESSIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        {!existing?.isCore && (
          <Field label="Assign to">
            <select
              value={assignment}
              onChange={(e) => setAssignment(e.target.value as WorkoutAssignment)}
              className="w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100"
            >
              {ASSIGNMENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Button onClick={handleSave} disabled={!name.trim() || repTargets == null}>
          {isNew ? 'Create exercise' : 'Save'}
        </Button>

        {existing && !existing.isCore && (
          <Button variant="destructive" onClick={() => setConfirmArchive(true)}>
            Archive exercise
          </Button>
        )}
      </div>

      <ConfirmSheet
        open={confirmArchive}
        title="Archive this exercise?"
        body="Archiving hides it from your library without deleting its history. You can restore it later."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (existing) await archiveExercise(existing.id);
          setConfirmArchive(false);
          navigate('/exercises');
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}

/** Non-uniform sets show every rep target; uniform ones show the single number. */
function initialRepsText(existing: Exercise | undefined): string {
  if (!existing) return '5';
  const targets = workSetRepTargets(existing);
  if (targets.length === 0) return String(existing.defaultReps);
  return targets.every((r) => r === targets[0]) ? String(targets[0]) : targets.join('/');
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-label uppercase tracking-[0.12em] text-chalk-500">{label}</span>
      {children}
    </label>
  );
}
