/**
 * The reports-to ladder, derived.
 *
 * Only Manager 1 is stored (`employees.manager_id`). The levels above
 * it are not facts of their own — "the level above my direct leader" is
 * my Manager 1's Manager 1 — so they are computed by walking the chain
 * rather than saved. A stored copy could contradict the hierarchy, and
 * did: an employee could name a Manager 2 who was nowhere above their
 * Manager 1, and nothing updated the copy when the real chain changed.
 *
 * Deriving also makes re-parenting free. Dragging someone onto a new
 * manager in the org chart writes one field; every level above follows
 * on the next render with nothing else to keep in step.
 */

import { Employee } from '../types/hrms';

/** Identity as it appears in a `managerId`: a UUID in live mode, an
 *  empNo in mock mode. Mirrors the org chart's `keyOf`. */
export function managerKeyOf(e: Employee): string {
  return (e as { apiId?: string }).apiId ?? e.id;
}

/** How many levels above the direct leader we surface. Level 1 is the
 *  direct leader, so 3 total rungs. */
export const LADDER_DEPTH = 3;

/**
 * Walk up from `employee`, returning one entry per rung — index 0 is
 * Manager 1 (the direct leader), index 1 the level above, and so on.
 * Shorter than {@link LADDER_DEPTH} when the chain runs out at the top
 * of the org.
 *
 * Cycle-safe: a chain that loops back on itself stops rather than
 * spinning. Real data does contain loops after a careless edit, which
 * is why the org chart's forest builder guards the same way.
 */
export function managerLadder(employee: Employee, roster: Employee[]): Employee[] {
  const byKey = new Map(roster.map(e => [managerKeyOf(e), e]));
  const out: Employee[] = [];
  const seen = new Set<string>([managerKeyOf(employee)]);

  let cur: Employee | undefined = employee;
  while (out.length < LADDER_DEPTH) {
    const nextKey = cur?.managerId;
    if (!nextKey || seen.has(nextKey)) break;
    const next = byKey.get(nextKey);
    if (!next) break;                 // manager outside the loaded roster
    seen.add(nextKey);
    out.push(next);
    cur = next;
  }
  return out;
}

/** Labels for the rungs, so every screen names them identically. */
export const LADDER_LABELS = ['Manager 1', 'Manager 2', 'Manager 3'];

/**
 * The employee's direct leader, or null when they have none worth
 * showing.
 *
 * Null covers three cases that all mean the same thing to a reader —
 * there is nobody above this person to name:
 *   • no manager set at all (Level 0, top of the org);
 *   • a manager who isn't in the roster we loaded;
 *   • a manager that resolves to the employee themselves, which the
 *     org chart already treats as no manager.
 *
 * Callers render nothing for null rather than a placeholder. "No leader
 * assigned" reads as a gap somebody should fill, but for the top of an
 * org it is simply the correct and permanent answer.
 */
export function leaderOf(employee: Employee | undefined, roster: Employee[]): Employee | null {
  const managerKey = employee?.managerId;
  if (!employee || !managerKey) return null;
  if (managerKey === managerKeyOf(employee)) return null;   // self-manager
  const hit = roster.find(e => managerKeyOf(e) === managerKey || e.id === managerKey);
  if (!hit) return null;
  return managerKeyOf(hit) === managerKeyOf(employee) ? null : hit;
}
