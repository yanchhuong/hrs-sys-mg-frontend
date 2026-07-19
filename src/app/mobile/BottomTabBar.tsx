import { LayoutGrid, ShoppingCart, User } from 'lucide-react';
import type { MobileTab } from './MobileShell';

const TABS: { key: MobileTab; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'sale',      label: 'Sale',      icon: ShoppingCart },
  { key: 'profile',   label: 'Profile',   icon: User },
];

/**
 * Fixed bottom nav for the tablet shell. Big tap targets (72px height,
 * 24px icons) so it feels right under a thumb. Active tab paints blue;
 * inactive gets a muted gray with a hover state for cursor use in the
 * browser preview.
 */
export function BottomTabBar({
  current, onChange,
}: {
  current: MobileTab;
  onChange: (t: MobileTab) => void;
}) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-3xl bg-white border-t border-gray-200 shadow-lg z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-3">
        {TABS.map(t => {
          const active = current === t.key;
          const Icon = t.icon;
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => onChange(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`w-full h-18 py-3 flex flex-col items-center justify-center gap-1 transition ${
                  active
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs font-medium">{t.label}</span>
                {active && <span className="h-0.5 w-8 rounded-full bg-blue-600 mt-0.5" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
