/**
 * v-category-order — the pure part of the Categories dialog: move a row,
 * tell a changed order from the saved one, name a rename the way the
 * server stores it. Same as the mobile app's src/lib/categoryOrder.ts.
 */

/** The list with the row at `i` moved one place up (-1) or down (+1).
 *  A move off either end returns the list unchanged. */
export function moveAt<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** As the server stores a category: trimmed, lowercase, at most 64. */
export function categoryKey(name: string): string {
  return name.trim().toLowerCase().slice(0, 64);
}

/** After a rename, the value a form field should hold: the new name when
 *  it held the old one, else what it had. */
export function renamedValue(value: string, from: string, to: string): string {
  return value && categoryKey(value) === categoryKey(from) ? to : value;
}
