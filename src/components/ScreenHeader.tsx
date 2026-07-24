import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  showSettings?: boolean;
  right?: ReactNode;
}

export function ScreenHeader({ title, showBack, showSettings, right }: ScreenHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="flex h-14 items-center justify-between px-5 pt-2">
      <div className="flex items-center gap-3">
        {showBack && (
          <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="text-chalk-100">
            <ArrowLeft size={22} strokeWidth={1.5} />
          </button>
        )}
        <h1 className="text-label uppercase tracking-[0.12em] text-chalk-500">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {right}
        {showSettings && (
          <Link to="/settings" aria-label="Settings" className="text-chalk-100">
            <Settings size={22} strokeWidth={1.5} />
          </Link>
        )}
      </div>
    </header>
  );
}
