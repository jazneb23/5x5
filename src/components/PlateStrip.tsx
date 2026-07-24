import type { Unit } from '../domain/types';
import { plateBreakdownForDisplay } from '../domain/plates';

interface PlateVisual {
  height: number;
  colorVar: string;
}

const LB_VISUALS: Record<number, PlateVisual> = {
  45: { height: 36, colorVar: 'var(--plate-45)' },
  35: { height: 32, colorVar: 'var(--plate-35)' },
  25: { height: 27, colorVar: 'var(--plate-25)' },
  10: { height: 22, colorVar: 'var(--plate-10)' },
  5: { height: 17, colorVar: 'var(--plate-5)' },
  2.5: { height: 13, colorVar: 'var(--plate-2p5)' },
};

const KG_VISUALS: Record<number, PlateVisual> = {
  20: { height: 36, colorVar: 'var(--plate-45)' },
  15: { height: 32, colorVar: 'var(--plate-35)' },
  10: { height: 27, colorVar: 'var(--plate-25)' },
  5: { height: 22, colorVar: 'var(--plate-10)' },
  2.5: { height: 17, colorVar: 'var(--plate-5)' },
  1.25: { height: 13, colorVar: 'var(--plate-2p5)' },
};

function visualFor(weight: number, unit: Unit): PlateVisual {
  const table = unit === 'lb' ? LB_VISUALS : KG_VISUALS;
  return table[weight] ?? { height: 9, colorVar: 'var(--plate-frac)' };
}

interface PlateStripProps {
  targetWeight: number;
  barWeight: number;
  availablePlates: number[];
  unit: Unit;
  size?: 'md' | 'sm';
}

export function PlateStrip({ targetWeight, barWeight, availablePlates, unit, size = 'md' }: PlateStripProps) {
  const { plates, remainder } = plateBreakdownForDisplay(targetWeight, barWeight, availablePlates);
  const scale = size === 'sm' ? 0.7 : 1;

  return (
    <div className={remainder > 0 ? 'rounded-md border border-fail px-2 py-1.5 inline-block' : 'inline-block'}>
      <div className="flex items-end gap-[3px]" style={{ height: 36 * scale }}>
        <div className="w-[2px] self-stretch bg-iron-700" aria-hidden="true" />
        {plates.length === 0 ? (
          <div className="h-full w-[10px]" />
        ) : (
          plates.map((p, i) => {
            const visual = visualFor(p, unit);
            return (
              <div
                key={i}
                className="w-[10px] rounded-[2px]"
                style={{ height: visual.height * scale, background: visual.colorVar }}
                title={`${p} ${unit.toUpperCase()}`}
              />
            );
          })
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-label uppercase tracking-[0.12em] text-chalk-500">
        <span>
          BAR {barWeight} {plates.length > 0 && `+ ${plates.join(' ')}`} PER SIDE
        </span>
        {remainder > 0 && (
          <span className="rounded-sm bg-fail/10 px-1.5 py-0.5 text-fail">+{remainder} SHORT</span>
        )}
      </div>
    </div>
  );
}
