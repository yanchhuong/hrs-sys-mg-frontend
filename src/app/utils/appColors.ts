/**
 * Per-app tile colours. Keyed by the nav-leaf id so the AppLauncher tiles
 * and the sidebar leaves can share one source of truth. Values are
 * intentionally literal class names — `bg-XXX-100 text-XXX-700` — so
 * Tailwind's purge keeps every utility. String-interpolating the hue
 * would break the production build.
 *
 * Adding a new nav leaf? Add an entry here. Anything missing falls back
 * to the category-level colour at the call site.
 */
export const APP_TILE_COLOR: Record<string, string> = {
  // -- HR ---------------------------------------------------------------
  'dashboard':          'bg-blue-100 text-blue-700',
  'employees':          'bg-sky-100 text-sky-700',
  'attendance':         'bg-cyan-100 text-cyan-700',
  'overtime':           'bg-amber-100 text-amber-700',
  'all-leave':          'bg-emerald-100 text-emerald-700',
  'exception':          'bg-rose-100 text-rose-700',
  'payroll':            'bg-indigo-100 text-indigo-700',
  'benefit-calculator': 'bg-violet-100 text-violet-700',
  'increase':           'bg-teal-100 text-teal-700',
  'deduction':          'bg-pink-100 text-pink-700',
  // -- Account ----------------------------------------------------------
  'customers':          'bg-blue-100 text-blue-700',
  'invoices':           'bg-emerald-100 text-emerald-700',
  'vendors':            'bg-purple-100 text-purple-700',
  'bills':              'bg-orange-100 text-orange-700',
  'receipts':           'bg-teal-100 text-teal-700',
  // -- Reports ----------------------------------------------------------
  'attendance-report':  'bg-cyan-100 text-cyan-700',
  'payroll-report':     'bg-indigo-100 text-indigo-700',
  'compliance-report':  'bg-red-100 text-red-700',
  'sale-ledger':        'bg-emerald-100 text-emerald-700',
  'purchase-ledger':    'bg-amber-100 text-amber-700',
  'profit-loss':        'bg-violet-100 text-violet-700',
  // -- Admin ------------------------------------------------------------
  'settings':              'bg-slate-100 text-slate-700',
  'attendance-settings':   'bg-cyan-100 text-cyan-700',
  'employee-settings':     'bg-sky-100 text-sky-700',
  'user-management':       'bg-indigo-100 text-indigo-700',
  'payroll-categories':    'bg-violet-100 text-violet-700',
};

/**
 * Just the text-colour slice of {@link APP_TILE_COLOR} — used by the
 * sidebar where the row itself is the hover/active background and the
 * leaf icon only needs to pick up the brand hue. Returns an empty
 * string for unknown ids so the caller's default styling wins.
 */
const TEXT_COLOR_ONLY: Record<string, string> = Object.fromEntries(
  Object.entries(APP_TILE_COLOR).map(([k, v]) => {
    const text = v.split(' ').find(c => c.startsWith('text-')) ?? '';
    return [k, text];
  }),
);

export function appIconColor(id: string): string {
  return TEXT_COLOR_ONLY[id] ?? '';
}
