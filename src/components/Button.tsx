import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-signal text-chalk-100 font-semibold h-14',
  secondary: 'bg-transparent border border-iron-700 text-chalk-100 h-14',
  ghost: 'bg-transparent text-chalk-500 h-12',
  destructive: 'bg-transparent border border-fail text-fail h-14',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`w-full rounded-sm px-6 text-body transition-colors active:bg-white/[0.04] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-iron-950 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
