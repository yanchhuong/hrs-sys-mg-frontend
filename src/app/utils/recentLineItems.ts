/**
 * "Recently used line items" cache — powers the on-focus suggestion
 * dropdown under the Item input on the Invoice, Quotation, Voucher,
 * and Bill forms.
 *
 * <p>Storage is browser-local — survives reloads, scopes per
 * machine.</p>
 *
 * <p><b>Bucketed by scope</b> (v-recent-items-per-scope). The sale-
 * side docs (Invoice / Quotation / Voucher) sell similar things and
 * historically share a single bucket. Purchase-side Bill has a
 * completely different item catalog (rent, subscriptions, supplier
 * SKUs), so it gets its OWN localStorage key. The optional
 * {@code scope} arg picks the bucket:
 *   <li>omitted / undefined → sale-side bucket (existing behaviour)</li>
 *   <li>'bill' → purchase-side bucket</li>
 * Add new scopes (e.g. 'expense') by passing the same string on both
 * read + write.</p>
 */

const STORAGE_KEY_BASE = 'hrms:recentLineItems';

function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY_BASE}:${scope}` : STORAGE_KEY_BASE;
}
/** Hard cap on stored entries so localStorage stays light. The
 *  on-focus dropdown only surfaces the top {@link DEFAULT_LIMIT}
 *  of these; the rest are kept so a name briefly bumped out can
 *  resurface if the user picks it again. */
const MAX_STORED = 50;
/** What `getRecentLineItems()` returns by default. Matches the UX
 *  spec: "show recent list 5 Item name". */
const DEFAULT_LIMIT = 5;

export interface RecentLineItem {
  /** The item / service name as typed into the line. Used as the
   *  dedup key — repicking a name updates its timestamp. */
  name: string;
  unit?: string;
  /** Last-known unit price for this name. Picking the recent
   *  pre-fills the line's unit price so HR doesn't retype. */
  unitPrice?: number;
  /** ISO timestamp of the last save that included this name. Sort
   *  key for the most-recent-first ordering. */
  usedAt: string;
}

/** Most-recent-first up to {@link DEFAULT_LIMIT} entries. Returns
 *  an empty array on any storage error so callers can render the
 *  empty case without try/catch. `scope` selects which bucket to
 *  read from (see the module doc). */
export function getRecentLineItems(limit = DEFAULT_LIMIT, scope?: string): RecentLineItem[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentLineItem[];
    if (!Array.isArray(list)) return [];
    return list.slice(0, limit);
  } catch {
    return [];
  }
}

/** Push line items into the cache. Called from the form's save
 *  handler — usually with the just-submitted items so a refresh
 *  shows them on top. Dedupes by name (case-sensitive); the re-add
 *  updates the timestamp and the unit / unitPrice. `scope` picks
 *  the bucket (see the module doc). */
export function addRecentLineItems(
  items: Array<{ name?: string | null; unit?: string | null; unitPrice?: number | null }>,
  scope?: string,
): void {
  try {
    const existing = readRaw(scope);
    const byName = new Map<string, RecentLineItem>(existing.map(r => [r.name, r]));
    const now = new Date().toISOString();
    for (const it of items) {
      const name = (it.name ?? '').trim();
      if (!name) continue;
      byName.set(name, {
        name,
        unit: it.unit?.trim() || undefined,
        unitPrice: typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice)
          ? it.unitPrice
          : undefined,
        usedAt: now,
      });
    }
    // Most-recent first, hard-capped so the JSON blob can't grow
    // unbounded if a tenant churns through thousands of items.
    const sorted = [...byName.values()].sort((a, b) => b.usedAt.localeCompare(a.usedAt));
    localStorage.setItem(storageKey(scope), JSON.stringify(sorted.slice(0, MAX_STORED)));
  } catch {
    // Storage full / disabled — best-effort cache, no UX impact.
  }
}

function readRaw(scope?: string): RecentLineItem[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentLineItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
