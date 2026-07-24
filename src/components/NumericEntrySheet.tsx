import { useEffect, useState } from 'react';
import { Button } from './Button';

interface NumericEntrySheetProps {
  open: boolean;
  initialValue: number;
  label: string;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}

export function NumericEntrySheet({ open, initialValue, label, onSubmit, onCancel }: NumericEntrySheetProps) {
  const [value, setValue] = useState(String(initialValue));

  // The sheet stays mounted (rendering null) while closed so it can animate
  // back open; without this, reopening it for a different set or a changed
  // weight would keep showing whatever was last typed instead of the
  // current value.
  useEffect(() => {
    if (open) setValue(String(initialValue));
  }, [open, initialValue]);

  if (!open) return null;

  function press(digit: string) {
    if (digit === 'back') {
      setValue((v) => v.slice(0, -1));
      return;
    }
    setValue((v) => (v === '0' ? digit : v + digit));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-app rounded-t-lg border border-iron-700 bg-iron-900 p-5"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-label uppercase tracking-[0.12em] text-chalk-500">{label}</p>
        <p className="mb-4 text-center font-mono text-weight-lg text-chalk-100">{value || '0'}</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'].map((k) =>
            k === 'ok' ? (
              <button
                key={k}
                type="button"
                onClick={() => onSubmit(Number(value || '0'))}
                className="h-14 rounded-sm bg-signal text-body-strong text-chalk-100"
              >
                OK
              </button>
            ) : (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="h-14 rounded-sm bg-iron-800 text-title text-chalk-100"
              >
                {k === 'back' ? '⌫' : k}
              </button>
            ),
          )}
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
