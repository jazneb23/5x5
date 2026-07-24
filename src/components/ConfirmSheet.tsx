import type { ReactNode } from 'react';
import { Button } from './Button';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  children?: ReactNode;
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
  destructive = true,
  children,
}: ConfirmSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-app rounded-t-lg border border-iron-700 bg-iron-900 p-5"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-title text-chalk-100">{title}</h2>
        {body && <p className="mb-6 text-body text-chalk-300">{body}</p>}
        {children}
        <div className="space-y-3">
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
