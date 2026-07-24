import { useMemo, useState } from 'react';
import { buildCoreExercises, type ExperienceLevel } from '../../domain/program';
import type { Unit } from '../../domain/types';
import { useAppStore } from '../../state/useAppStore';
import { Button } from '../../components/Button';

type Step = 'unit' | 'experience' | 'review';

export function Onboarding() {
  const [step, setStep] = useState<Step>('unit');
  const [unit, setUnit] = useState<Unit>('lb');
  const [experience, setExperience] = useState<ExperienceLevel>('new');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [submitting, setSubmitting] = useState(false);

  const barWeight = unit === 'lb' ? 45 : 20;
  const previewExercises = useMemo(
    () => buildCoreExercises(unit, experience, barWeight),
    [unit, experience, barWeight],
  );

  async function finish() {
    setSubmitting(true);
    await completeOnboarding(experience, unit, overrides);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-app">
        <p className="mb-1 text-label uppercase tracking-[0.12em] text-chalk-500">Welcome</p>
        <h1 className="mb-8 font-display text-display-md text-chalk-100">5x5</h1>

        {step === 'unit' && (
          <div className="space-y-6">
            <p className="text-body text-chalk-300">Which unit do you train in?</p>
            <div className="grid grid-cols-2 gap-3">
              {(['lb', 'kg'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-14 rounded-sm border text-body-strong uppercase ${
                    unit === u ? 'border-signal text-chalk-100' : 'border-iron-700 text-chalk-500'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <Button onClick={() => setStep('experience')}>Continue</Button>
          </div>
        )}

        {step === 'experience' && (
          <div className="space-y-6">
            <p className="text-body text-chalk-300">Have you lifted these before?</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setExperience('new')}
                className={`w-full rounded-md border p-4 text-left ${
                  experience === 'new' ? 'border-signal' : 'border-iron-700'
                }`}
              >
                <div className="text-body-strong text-chalk-100">New to barbell training</div>
                <div className="text-data text-chalk-500">Start light on everything, bar weight and up</div>
              </button>
              <button
                type="button"
                onClick={() => setExperience('some')}
                className={`w-full rounded-md border p-4 text-left ${
                  experience === 'some' ? 'border-signal' : 'border-iron-700'
                }`}
              >
                <div className="text-body-strong text-chalk-100">Some experience</div>
                <div className="text-data text-chalk-500">Start closer to working weight</div>
              </button>
            </div>
            <Button onClick={() => setStep('review')}>Continue</Button>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <p className="text-body text-chalk-300">Starting weights. Edit any of these before you begin.</p>
            <div className="divide-y divide-iron-800">
              {previewExercises.map((ex) => (
                <div key={ex.id} className="flex items-center justify-between py-3">
                  <span className="text-body text-chalk-100">{ex.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="w-20 rounded-sm border border-iron-700 bg-transparent px-2 py-2 text-right font-mono text-data text-chalk-100"
                      value={overrides[ex.id] ?? ex.startingWeight}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [ex.id]: Number(e.target.value) }))
                      }
                    />
                    <span className="text-label text-chalk-500">{unit.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={finish} disabled={submitting}>
              {submitting ? 'Setting up…' : 'Finish'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
