import { Button } from '../ui/button';
import { Users, User, UsersRound } from 'lucide-react';
import { ScopeMode } from '../../hooks/useTeamScope';

interface ScopePickerProps {
  value: ScopeMode;
  onChange: (v: ScopeMode) => void;
  /** Optional override when a view wants to hide the "Team" option. */
  hideTeam?: boolean;
  className?: string;
}

const OPTIONS: { key: ScopeMode; label: string; icon: React.ReactNode }[] = [
  { key: 'all',  label: 'All (me + team)', icon: <Users      className="h-3.5 w-3.5" /> },
  { key: 'mine', label: 'Mine',            icon: <User       className="h-3.5 w-3.5" /> },
  { key: 'team', label: 'Team',            icon: <UsersRound className="h-3.5 w-3.5" /> },
];

/**
 * Compact chip picker used on leader-scoped views (Attendance / Overtime / Leave).
 * Not rendered for admin — admin sees the whole tenant regardless.
 */
export function ScopePicker({ value, onChange, hideTeam, className }: ScopePickerProps) {
  const opts = hideTeam ? OPTIONS.filter(o => o.key !== 'team') : OPTIONS;
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {opts.map((opt) => (
        <Button
          key={opt.key}
          variant={value === opt.key ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => onChange(opt.key)}
        >
          {opt.icon}
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
