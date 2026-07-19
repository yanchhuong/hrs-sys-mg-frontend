import { MobileDashboard } from './views/MobileDashboard';
import { MobileSale } from './views/MobileSale';
import { MobileProfile } from './views/MobileProfile';
import { BottomTabBar } from './BottomTabBar';

export type MobileTab = 'dashboard' | 'sale' | 'profile';

/**
 * Tab-based shell rendered post-login. A fixed max-width matches an
 * iPad portrait canvas so the layout stays readable on a browser
 * dev-tool preview as well as a real tablet. The bottom tab bar is
 * pinned via {@code sticky bottom-0} so long-scroll tabs (Sale's
 * items grid) don't lose the switcher.
 */
export function MobileShell({
  tab, onTabChange,
}: {
  tab: MobileTab;
  onTabChange: (t: MobileTab) => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex justify-center">
      <div className="w-full max-w-3xl bg-white flex flex-col shadow-sm">
        <main className="flex-1 overflow-y-auto pb-24">
          {tab === 'dashboard' && <MobileDashboard />}
          {tab === 'sale'      && <MobileSale />}
          {tab === 'profile'   && <MobileProfile />}
        </main>
        <BottomTabBar current={tab} onChange={onTabChange} />
      </div>
    </div>
  );
}
