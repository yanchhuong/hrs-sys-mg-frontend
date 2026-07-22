import { useState } from 'react';
import { Switch } from './ui/switch';
import { Cloud, HardDrive } from 'lucide-react';
import { API_BASE } from '../api/client';
import { getDesktopApiMode, setDesktopApiMode } from '../utils/runtime';

/**
 * Online/Offline API-base toggle for the Tauri desktop shell.
 *
 * Rendered from LandingPage's nav slot (App.tsx only mounts it when
 * running in Tauri). Kept as its own component so the login card no
 * longer has to know about desktop-vs-web branching.
 *
 * URL text is intentionally hidden — it's carried as a native tooltip
 * on the strip so support can still see which host this shell talks
 * to without cluttering the UI.
 */
export function DesktopApiModeSwitch(): JSX.Element {
  const [mode, setMode] = useState<'online' | 'offline'>(() => getDesktopApiMode());
  const online = mode === 'online';
  return (
    <div
      className="hidden sm:flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
      title={API_BASE}
    >
      {online
        ? <Cloud className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        : <HardDrive className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
      <span className="text-xs font-medium text-slate-700">
        {online ? 'Online' : 'Offline'}
      </span>
      <Switch
        aria-label="Toggle Online / Offline API"
        checked={online}
        onCheckedChange={(v) => {
          const next = v ? 'online' : 'offline';
          setMode(next);
          setDesktopApiMode(next);
        }}
      />
    </div>
  );
}
