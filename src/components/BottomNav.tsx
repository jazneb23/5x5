import { NavLink } from 'react-router-dom';
import { Dumbbell, History, LineChart, ListChecks } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Today', icon: Dumbbell, end: true },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/progress', label: 'Progress', icon: LineChart, end: false },
  { to: '/exercises', label: 'Lifts', icon: ListChecks, end: false },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-app border-t border-iron-700 bg-iron-950"
      style={{ height: 'var(--nav-total-height)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center justify-center gap-1 ${
              isActive ? 'text-chalk-100' : 'text-chalk-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-0 h-[2px] w-10 bg-signal" aria-hidden="true" />}
              <Icon size={24} strokeWidth={1.5} />
              <span className="text-label uppercase tracking-[0.12em]" style={{ fontSize: 10 }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
