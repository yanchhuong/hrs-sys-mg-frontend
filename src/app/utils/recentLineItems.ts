/**
 * Shared "recently used line items" cache. Powers the on-focus
 * suggestion dropdown that appears under the Item input on the
 * Invoice, Quotation, and General Voucher forms.
 *
 * <p>Storage is browser-local — survives reloads, scopes per
 * machine. A future enhancement could move this server-side
 * (recent line items joined across the three doc tables) for
 * cross-device persistence; for now the per-browser approach is
 * good enough for the typeahead use-case and ships without an
 * extra API round-trip on form open.</p>
 */

const STORAGE_KEY = 'hrms:recentLineItems';
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
 *  empty case without try/catch. */
export function getRecentLineItems(limit = DEFAULT_LIMIT): RecentLineItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
 *  shows them on top. Dedupes by name (case-sensitive); the
 *  re-add updates the timestamp and the unit / unitPrice. */
export function addRecentLineItems(
  items: Array<{ name?: string | null; unit?: string | null; unitPrice?: number | null }>,
): void {
  try {
    const existing = readRaw();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, MAX_STORED)));
  } catch {
    // Storage full / disabled — best-effort cache, no UX impact.
  }
}

function readRaw(): RecentLineItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentLineItem[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
