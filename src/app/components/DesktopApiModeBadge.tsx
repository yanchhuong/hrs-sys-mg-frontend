import { Cloud, HardDrive } from 'lucide-react';
import { API_BASE } from '../api/client';
import { getDesktopApiMode } from '../utils/runtime';

/**
 * Read-only top-bar indicator of the desktop shell's current API mode.
 * Deliberately non-interactive — flipping mode requires a hard reload
 * (JWT invalidates across hosts), so the switch belongs on the login
 * page where losing the session is expected. Hover reveals the URL.
 */
export function DesktopApiModeBadge(): JSX.Element {
  const online = getDesktopApiMode() === 'online';
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium ' +
        (online
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-600')
      }
      title={API_BASE}
      aria-label={online ? 'Online mode' : 'Offline mode'}
    >
      {online
        ? <Cloud className="h-3.5 w-3.5" />
        : <HardDrive className="h-3.5 w-3.5" />}
      <span className="hidden md:inline">{online ? 'Online' : 'Offline'}</span>
    </span>
  );
}
