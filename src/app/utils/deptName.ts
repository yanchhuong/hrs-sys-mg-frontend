/**
 * Department-name resolver shared by every view that renders a `Dept`
 * column. Centralised so a single rule decides what to show when the
 * employee's `departmentId` references a department that was deleted —
 * without this, the raw UUID leaked into the UI (e.g. "Dara Sovita →
 * d3bb6769-e86c-4365-98fb-426b0ad814c5").
 */

/** Matches the canonical 8-4-4-4-12 hex UUID shape, case-insensitive. */
export const looksLikeUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Build a (departmentId | name) → display-name resolver from a loaded
 * departments list. Behaviour:
 *
 *   • `undefined` / blank / "-"      → {@code missingLabel}
 *   • known UUID                     → its name
 *   • UUID-shaped but unknown        → {@code missingLabel}
 *     (stale FK left behind after the dept was deleted)
 *   • anything else (mock-mode name) → returned as-is so identity survives
 *
 * Pass a different {@code missingLabel} when the calling screen wants a
 * specific placeholder, e.g. "Unassigned" on the Positions admin screen.
 */
export function makeDeptName(
  departments: ReadonlyArray<{ id: string; name: string }>,
  missingLabel = '—',
) {
  const byId = new Map(departments.map(d => [d.id, d.name]));
  return (idOrName: string | undefined): string => {
    if (!idOrName || idOrName === '-') return missingLabel;
    const hit = byId.get(idOrName);
    if (hit) return hit;
    if (looksLikeUuid(idOrName)) return missingLabel;
    return idOrName;
  };
}
