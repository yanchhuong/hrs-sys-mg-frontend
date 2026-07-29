/**
 * Shared category-chip derivation for the POS grid and the Public
 * Shop page. Both surfaces render the same "All + known + custom +
 * Other" chip strip, and both hide empty buckets so an operator only
 * sees chips that actually filter something. Keeping the logic in
 * one place stops the two from drifting on future edits — a colour,
 * ordering, or empty-hiding change on one surface now automatically
 * applies to the other.
 *
 * See v-shared-category-chips (2026-07-29). POS: {@link ../components/views/POS.tsx}.
 * Public shop: {@link ../components/views/PublicShopPage.tsx}.
 */

/** Fixed set of "well-known" POS categories the tenant didn't have
 *  to type. Order matters — this drives the on-screen order of
 *  chips after 'all' and before any custom labels. 'other' pinned
 *  LAST inside the caller so the catch-all bucket never renders
 *  mid-strip. */
export const KNOWN_POS_CATEGORIES: readonly string[] =
  ['drink', 'snack', 'food', 'craft', 'souvenir', 'jewelry', 'other'];

/** Display labels for the well-known keys. Custom keys fall through
 *  to a Title Case rendering via {@link catLabel}. */
export const KNOWN_LABELS: Record<string, string> = {
  drink:    'Drinks',
  snack:    'Snacks',
  food:     'Food',
  craft:    'Craft',
  souvenir: 'Souvenir',
  jewelry:  'Jewelry',
  other:    'Other',
};

/** Normalise a raw item.category string into the chip key.
 *  Empty / missing categories bucket as 'other' so nothing falls
 *  off the grid. */
export function normalCat(raw: string | undefined | null): string {
  return (raw ?? '').trim().toLowerCase() || 'other';
}

/** Display label. 'all' → "All"; known keys use {@link KNOWN_LABELS}
 *  (pluralised for the well-known ones — "Drinks", "Snacks"); anything
 *  else is Title-Cased (first char up, rest as-typed). */
export function catLabel(key: string): string {
  if (key === 'all') return 'All';
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Item slice this helper needs — every property that both POS and
 *  the Public Shop item shape share. Using a structural type keeps
 *  the helper reusable without coupling either surface to the
 *  other's exact Item interface. */
export interface CategoryChipItem {
  category?: string | null;
}

/** Derived shape: the ordered chip-key list + per-key counts +
 *  total (for the "All" bucket). Consumers spread these into their
 *  chip-strip render loop. */
export interface CategoryChips {
  chipKeys: readonly string[];
  counts: Map<string, number>;
}

/** Build the chip strip from a filtered item slice — typically the
 *  in-stock / sellable set the caller already computed. Emits
 *  'all' first, then known-order categories excluding 'other',
 *  then any custom (tenant-typed) categories alphabetically, and
 *  'other' pinned last. Empty buckets are NOT dropped here so the
 *  render layer can still choose to show a chip if it's the active
 *  filter; callers pass `chipKeys.filter(k => k === 'all' ||
 *  active === k || counts.get(k) > 0)` at render time. */
export function deriveCategoryChips<T extends CategoryChipItem>(
  items: readonly T[],
): CategoryChips {
  const counts = new Map<string, number>();
  counts.set('all', items.length);
  for (const it of items) {
    const k = normalCat(it.category);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const knownExclOther = KNOWN_POS_CATEGORIES.filter(k => k !== 'other');
  const customs = Array.from(new Set(items.map(i => normalCat(i.category))))
    .filter(k => !KNOWN_POS_CATEGORIES.includes(k))
    .sort();
  const chipKeys: readonly string[] = ['all', ...knownExclOther, ...customs, 'other'];
  return { chipKeys, counts };
}
