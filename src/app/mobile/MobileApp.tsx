import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MobileLogin } from './MobileLogin';
import { MobileShell, type MobileTab } from './MobileShell';

/**
 * Root of the tablet-sized mobile shell mounted at {@code /mobile}.
 *
 * <p>Reuses the tenant's {@link AuthContext} for session state — so a
 * user already logged in on the desktop web lands straight on the
 * shell — but exposes its own tablet-optimized login screen for the
 * fresh-open case. All three tabs (Dashboard / Sale / Profile) live
 * under {@link MobileShell}; they share the same shell chrome so
 * switching tabs is a state flip, not a route change.</p>
 */
export function MobileApp() {
  const { currentUser, loading } = useAuth();
  const [tab, setTab] = useState<MobileTab>('dashboard');

  // Boot-time /auth/me is pending — hold the render so we don't flash
  // the login screen and then bounce to the shell.
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return <MobileLogin />;
  }

  return <MobileShell tab={tab} onTabChange={setTab} />;
}
