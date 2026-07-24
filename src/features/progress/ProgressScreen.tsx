import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as repo from '../../data/repository';
import { allTimeBest, estimated1RM } from '../../domain/prs';
import { useAppStore } from '../../state/useAppStore';
import { ScreenHeader } from '../../components/ScreenHeader';

function formatAxisDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short' });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function ProgressScreen() {
  const exercises = useAppStore((s) => s.exercises);
  const exerciseStates = useAppStore((s) => s.exerciseStates);
  const settings = useAppStore((s) => s.settings);
  const workouts = useLiveQuery(() => repo.getAllWorkouts(), []);
  const deloadEvents = useLiveQuery(() => repo.getDeloadEvents(), []);

  const visibleExercises = exercises.filter((e) => !e.archived);
  const [selectedId, setSelectedId] = useState<string>(visibleExercises[0]?.id ?? '');
  const [show1RM, setShow1RM] = useState(false);

  const selected = exercises.find((e) => e.id === selectedId) ?? visibleExercises[0];

  const completed = (workouts ?? []).filter((w) => w.completedAt != null).sort((a, b) => (a.completedAt as number) - (b.completedAt as number));

  const chartData = useMemo(() => {
    if (!selected) return [];
    return completed
      .map((w) => {
        const log = w.exercises.find((e) => e.exerciseId === selected.id);
        if (!log) return null;
        const workSets = log.sets.filter((s) => !s.isWarmup);
        const reps = workSets[0]?.targetReps ?? 5;
        const volume = workSets.reduce((sum, s) => sum + (s.completedReps ?? 0) * log.prescribedWeight, 0);
        return {
          at: w.completedAt as number,
          date: formatDate(w.completedAt as number),
          weight: log.prescribedWeight,
          oneRM: Math.round(estimated1RM(log.prescribedWeight, reps)),
          volume,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d != null);
  }, [completed, selected]);

  const exerciseDeloads = (deloadEvents ?? []).filter((d) => d.exerciseId === selected?.id);
  const best = selected ? allTimeBest(completed, selected.id) : null;
  const currentWeight = selected ? exerciseStates[selected.id]?.currentWeight ?? selected.startingWeight : 0;
  const totalSessions = chartData.length;
  const totalVolume = chartData.reduce((sum, d) => sum + d.volume, 0);

  const longestStreak = useMemo(() => {
    if (chartData.length === 0) return 0;
    let longest = 1;
    let current = 1;
    for (let i = 1; i < chartData.length; i++) {
      const gapDays = (chartData[i].at - chartData[i - 1].at) / (24 * 60 * 60 * 1000);
      if (gapDays <= 10) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }
    return longest;
  }, [chartData]);

  if (!selected) {
    return (
      <div>
        <ScreenHeader title="Progress" showSettings />
        <p className="px-5 text-body text-chalk-500">No exercises yet.</p>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Progress" showSettings />
      <div className="px-5 pb-6">
        <select
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mb-6 w-full rounded-sm border border-iron-700 bg-iron-900 px-3 py-3 text-body text-chalk-100"
        >
          {visibleExercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-weight-lg text-chalk-100">
            {currentWeight} <span className="text-label text-chalk-500">{settings.unit.toUpperCase()}</span>
          </span>
          <button
            type="button"
            onClick={() => setShow1RM((v) => !v)}
            className={`text-data ${show1RM ? 'text-signal' : 'text-chalk-500'}`}
          >
            Est. 1RM {show1RM ? 'on' : 'off'}
          </button>
        </div>

        {chartData.length === 0 ? (
          <p className="py-8 text-center text-body text-chalk-500">No sessions logged for this exercise yet.</p>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--iron-800)" />
                <XAxis
                  dataKey="at"
                  tickFormatter={formatAxisDate}
                  stroke="var(--chalk-500)"
                  tick={{ fontSize: 12, fill: 'var(--chalk-500)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--chalk-500)"
                  tick={{ fontSize: 12, fill: 'var(--chalk-500)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickCount={4}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--iron-800)', border: '1px solid var(--iron-700)', borderRadius: 8 }}
                  labelFormatter={(_, payload) => (payload?.[0]?.payload ? payload[0].payload.date : '')}
                  labelStyle={{ color: 'var(--chalk-300)' }}
                  itemStyle={{ color: 'var(--chalk-100)' }}
                />
                {exerciseDeloads.map((d) => (
                  <ReferenceLine key={d.at} x={d.at} stroke="var(--fail)" strokeDasharray="3 3" />
                ))}
                <Line type="monotone" dataKey="weight" stroke="var(--signal)" strokeWidth={2} dot={false} />
                {show1RM && <Line type="monotone" dataKey="oneRM" stroke="var(--chalk-500)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-6 divide-y divide-iron-800">
          <StatRow label="All time best" value={best ? `${best.weight} × ${best.reps}` : '—'} />
          <StatRow label="Sessions" value={String(totalSessions)} />
          <StatRow label="Total volume" value={totalVolume.toLocaleString()} />
          <StatRow label="Longest streak" value={`${longestStreak} sessions`} />
        </div>

        {chartData.length > 0 && (
          <>
            <p className="mb-2 mt-8 text-label uppercase tracking-[0.12em] text-chalk-500">Session volume</p>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--iron-800)" />
                  <XAxis dataKey="at" tickFormatter={formatAxisDate} tick={{ fontSize: 12, fill: 'var(--chalk-500)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--chalk-500)' }} axisLine={false} tickLine={false} width={40} tickCount={4} />
                  <Tooltip contentStyle={{ background: 'var(--iron-800)', border: '1px solid var(--iron-700)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="volume" stroke="var(--signal)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-label uppercase tracking-[0.12em] text-chalk-500">{label}</span>
      <span className="font-mono text-data text-chalk-100">{value}</span>
    </div>
  );
}
