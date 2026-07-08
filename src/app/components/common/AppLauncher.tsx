import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { NAV_LEAVES } from '../../config/nav';
import { Plus, Minus, Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import { APP_TILE_COLOR } from '../../utils/appColors';

/** Google-style 3x3 dot grid used by the apps trigger. Custom SVG so
 *  the visual matches the user spec exactly (lucide's grid icons all
 *  draw lines / squares instead of dots). */
function AppsDotsIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="5"  cy="5"  r="1.7" />
      <circle cx="12" cy="5"  r="1.7" />
      <circle cx="19" cy="5"  r="1.7" />
      <circle cx="5"  cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
      <circle cx="5"  cy="19" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
      <circle cx="19" cy="19" r="1.7" />
    </svg>
  );
}

/** Category buckets shown in the launcher panel, in display order.
 *  Each leaf carries the {@code module} key the backend gates on; the
 *  launcher writes that key (not the leaf id) when toggling install
 *  state — multiple nav leaves can share a module key (e.g. all four
 *  Reports leaves point at their respective sub-modules). */
// Keys must match the Super Admin → Module Categories table so the
// platform-managed labels resolve. Default seed there: 'hr',
// 'payroll', 'admin', 'report', 'accounting' (V74 + post-V74
// admin additions).
type CategoryKey = 'accounting' | 'cashflow' | 'hr' | 'admin' | 'report' | 'healthcare';
interface CategoryDef {
  key: CategoryKey;
  labelKey: string;
  installedBadge: string;
  ids: string[];
}
const CATEGORIES: CategoryDef[] = [
  {
    key: 'accounting', labelKey: 'apps.category.account',
    installedBadge: 'bg-emerald-100 text-emerald-700',
    ids: ['customers', 'quotations', 'invoices', 'pos', 'vouchers', 'vendors', 'bills', 'receipts', 'items', 'stock-movement', 'stock-adjustment'],
  },
  {
    key: 'cashflow', labelKey: 'apps.category.cashflow',
    installedBadge: 'bg-teal-100 text-teal-700',
    ids: ['transactions', 'cash-advances'],
  },
  {
    key: 'hr', labelKey: 'apps.category.hr',
    installedBadge: 'bg-sky-100 text-sky-700',
    ids: [
      'dashboard', 'employees',
      'attendance', 'overtime', 'all-leave', 'exception',
      'payroll', 'benefit-calculator', 'increase', 'deduction',
    ],
  },
  {
    key: 'report', labelKey: 'apps.category.report',
    installedBadge: 'bg-violet-100 text-violet-700',
    ids: [
      'attendance-report', 'payroll-report', 'compliance-report',
      'sale-ledger', 'purchase-ledger', 'profit-loss',
    ],
  },
  {
    key: 'admin', labelKey: 'apps.category.admin',
    installedBadge: 'bg-amber-100 text-amber-700',
    ids: [
      'approvals',
      'settings', 'attendance-settings', 'employee-settings',
      'user-management', 'payroll-categories',
    ],
  },
  {
    // Hospital business-base leaves (V181 seed:
    // module_categories.healthcare). Patients + Encounters both
    // gate on the {@code encounter} module, so toggling either
    // tile flips the same flag — Patients and Encounters install
    // and uninstall as a pair.
    key: 'healthcare', labelKey: 'apps.category.healthcare',
    installedBadge: 'bg-teal-100 text-teal-700',
    ids: ['patients', 'encounters', 'appointments'],
  },
];

interface AppLauncherProps {
  /** Currently active view id — kept for visual highlight so the admin
   *  can see which app the main canvas is sitting on; click doesn't
   *  navigate anymore (V100 behaviour change). */
  currentView: string;
  /** Retained for API parity with the previous nav-launcher shape but
   *  unused now that tile click toggles install state instead of
   *  navigating. Layout still passes it; trimming would touch the
   *  caller too. */
  onSelect: (viewId: string) => void;
}

/**
 * Top-bar "apps" launcher — tenant-admin install / uninstall surface.
 *
 * <p>Tile click flips the module's {@code tenant_modules.enabled} flag
 * for the whole company. The action mirrors what Super Admin can do
 * from the Companies → Tenant Modules page; this is the same flag,
 * just self-service for the tenant admin. The plus / minus badge in
 * the corner tells the user which action the click will take:</p>
 *
 * <ul>
 *   <li><b>Off / uninstalled</b> — grey tile, "+" badge. Click =
 *       install (enable for the tenant). Tile becomes colourful and
 *       the matching sidebar leaf appears.</li>
 *   <li><b>On / installed</b> — colourful tile, "−" badge. Click =
 *       uninstall (disable for the tenant). Tile fades to grey and
 *       the matching sidebar leaf drops out.</li>
 * </ul>
 *
 * <p>The Apps icon itself is gated by Super Admin's
 * {@code app_launcher_enabled} flag AND the user being Admin — see
 * the bail-outs below the hook block.</p>
 */
/** Install-state filter on the launcher panel. 'all' shows every
 *  tile (default), 'installed' shows only tiles enabled for the
 *  tenant, 'uninstalled' shows only tiles the admin could still
 *  install. Categories whose items all get filtered out drop away
 *  so the panel doesn't render empty section headers. */
type InstallFilter = 'all' | 'installed' | 'uninstalled';

const FILTERS: ReadonlyArray<{ key: InstallFilter; labelKey: string }> = [
  { key: 'all',         labelKey: 'apps.filter.all' },
  { key: 'installed',   labelKey: 'apps.filter.installed' },
  { key: 'uninstalled', labelKey: 'apps.filter.uninstalled' },
];

export function AppLauncher({ currentView, onSelect: _onSelect }: AppLauncherProps) {
  const { canView, isModuleAvailable, isAppLauncherEnabled, currentUser, setModuleEnabled, getModuleCategoryLabel } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InstallFilter>('all');
  /** Module-key being toggled right now. Shows a spinner on the tile
   *  and locks every other tile so a slow request doesn't get
   *  dog-piled. Null = idle. */
  const [pending, setPending] = useState<string | null>(null);

  /** Unfiltered tree — used to compute filter counts + drive the
   *  launcher-button visibility gate. Every leaf gets an
   *  {@code installed} flag derived from the same sidebar gate
   *  (permission grant AND module-enabled). Missing ids drop
   *  silently. */
  const fullTree = useMemo(() => {
    return CATEGORIES.map(c => {
      const items = c.ids
        .map(id => NAV_LEAVES.find(l => l.id === id))
        .filter((l): l is typeof NAV_LEAVES[number] => !!l)
        .map(l => ({
          leaf: l,
          installed: canView(l.module) && isModuleAvailable(l.module),
        }));
      return { ...c, items };
    }).filter(c => c.items.length > 0);
  }, [canView, isModuleAvailable]);

  /** Counts per filter — shown next to each pill so the admin sees
   *  how many apps land in each bucket without switching tabs.
   *  Uniques {@code by leaf.id} in case two categories share a leaf
   *  (defensive; not the case today). */
  const counts = useMemo(() => {
    const seen = new Set<string>();
    let inst = 0;
    let all = 0;
    for (const c of fullTree) {
      for (const it of c.items) {
        if (seen.has(it.leaf.id)) continue;
        seen.add(it.leaf.id);
        all += 1;
        if (it.installed) inst += 1;
      }
    }
    return { all, installed: inst, uninstalled: all - inst };
  }, [fullTree]);

  /** Filtered tree — drops items whose install-state doesn't match
   *  the current pill selection; categories left empty drop too. */
  const tree = useMemo(() => {
    if (filter === 'all') return fullTree;
    return fullTree
      .map(c => ({
        ...c,
        items: c.items.filter(({ installed }) =>
          filter === 'installed' ? installed : !installed),
      }))
      .filter(c => c.items.length > 0);
  }, [fullTree, filter]);

  const handleToggle = async (moduleKey: string, currentlyInstalled: boolean) => {
    if (pending) return;
    setPending(moduleKey);
    try {
      await setModuleEnabled(moduleKey, !currentlyInstalled);
      // The AuthContext state is updated by setModuleEnabled itself —
      // the tile + sidebar re-render once disabledModules /
      // availableModules change in the provider.
      toast.success(
        currentlyInstalled ? t('apps.uninstalled_toast') : t('apps.installed_toast'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update app');
    } finally {
      setPending(null);
    }
  };

  // Visibility gates — kept BELOW every hook call so the hook order
  // stays identical across renders (React's rules-of-hooks).
  //
  // The unfiltered gate uses CATEGORIES directly so switching the
  // install filter to a value that yields zero tiles doesn't
  // suddenly hide the launcher button mid-interaction — the panel
  // itself shows an empty-state message in that case.
  if (!isAppLauncherEnabled()) return null;
  if (currentUser?.role !== 'admin') return null;
  if (fullTree.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t('header.apps')} title={t('header.apps')}>
          <AppsDotsIcon className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[460px] p-0">
        {/* Two-row header: title row, then a full-width pill-tabs
            row so the filter has breathing room and the counts are
            legible. Same visual language as the Attendance / Payroll
            list tabs elsewhere in the app. */}
        <div className="px-4 pt-3 pb-2 border-b space-y-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{t('header.apps')}</span>
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label={t('apps.hint')}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  {t('apps.hint')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Install-state filter — bare inline tabs, no wrapper
              container. Active pill signals with blue text + a
              matching blue count chip; inactive pills are quiet
              grey with a subtle hover. */}
          <div className="inline-flex items-center gap-3" role="tablist" aria-label="Install filter">
            {FILTERS.map(f => {
              const active = filter === f.key;
              const count = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs transition-colors ${
                    active
                      ? 'text-blue-700 font-medium'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <span>{t(f.labelKey)}</span>
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] tabular-nums ${
                    active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {tree.length === 0 && (
            <div className="py-6 text-center text-xs text-gray-500">
              {t('apps.empty_for_filter')}
            </div>
          )}
          {tree.map(cat => (
            <div key={cat.key}>
              <div className="px-1 pb-2 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                {/* Prefer the Super-Admin-set label from the Module
                    Categories page (Super Admin → Module Categories
                    → Edit). Falls through to the hardcoded i18n
                    label only when the platform hasn't declared the
                    category yet. */}
                {getModuleCategoryLabel(cat.key) ?? t(cat.labelKey)}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {cat.items.map(({ leaf, installed }) => {
                  const Icon = leaf.icon;
                  const active = leaf.id === currentView;
                  // Visual hierarchy: active > installed > uninstalled.
                  // Active wins over the category hue so the user can
                  // see where the main canvas is parked; uninstalled
                  // drops everything to grey + faded label.
                  const badgeClass = active
                    ? 'bg-blue-600 text-white'
                    : installed
                      ? (APP_TILE_COLOR[leaf.id] ?? cat.installedBadge)
                      : 'bg-gray-100 text-gray-400';
                  const labelClass = active
                    ? 'text-blue-700 font-medium'
                    : installed
                      ? 'text-gray-700'
                      : 'text-gray-400';
                  // Corner action chip — + on uninstalled (will install
                  // on click), − on installed (will uninstall). Spinner
                  // replaces the chip while this leaf's module is being
                  // PUT to the backend.
                  const isPending = pending === leaf.module;
                  const cornerChipClass = installed
                    ? 'bg-rose-500 text-white'
                    : 'bg-emerald-500 text-white';
                  const tileLocked = pending !== null && !isPending;
                  return (
                    <button
                      key={leaf.id}
                      type="button"
                      disabled={tileLocked || isPending}
                      onClick={() => handleToggle(leaf.module, installed)}
                      title={installed ? t('apps.click_to_uninstall') : t('apps.click_to_install')}
                      className={`
                        group relative flex flex-col items-center justify-start gap-1.5 rounded-lg
                        px-2 py-3 text-center transition-colors
                        focus:outline-none focus:ring-2 focus:ring-blue-200
                        ${tileLocked ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-gray-100'}
                        ${active ? 'bg-blue-50 hover:bg-blue-50' : ''}
                      `}
                    >
                      {/* Corner action chip — only fades in on hover
                          (and focus, for keyboard users). In-flight
                          state and the focus ring keep it visible so
                          the toggle feedback isn't lost when the
                          pointer leaves. */}
                      <span className={`
                        absolute top-1 right-1 inline-flex h-4 w-4 items-center justify-center
                        rounded-full shadow-sm transition-opacity duration-150
                        ${isPending
                          ? 'bg-gray-200 text-gray-500 opacity-100'
                          : `${cornerChipClass} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}
                      `}>
                        {isPending
                          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          : installed
                            ? <Minus className="h-2.5 w-2.5" />
                            : <Plus className="h-2.5 w-2.5" />}
                      </span>
                      <span className={`
                        flex h-9 w-9 items-center justify-center rounded-lg
                        ${badgeClass}
                      `}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className={`text-[11px] leading-tight line-clamp-2 ${labelClass}`}>
                        {t(leaf.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
