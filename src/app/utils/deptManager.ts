/**
 * The department → "Reports To" follow-through, shared by every screen
 * that can move someone between departments.
 *
 * It lives here rather than inside a view because there is more than
 * one way to change an employee's department — the Employees page
 * (details sheet + inline row picker) and the Departments & Groups page
 * (add/remove member) — and they must agree. A second copy of this rule
 * is a second chance to get the PIC edge cases wrong.
 */

import { Employee } from '../types/hrms';

/** The employee's own identity as it would appear in a `managerId`
 *  field: a UUID in live mode, an empNo in mock mode. */
export function selfManagerKey(e: Employee): string {
  return (e as { apiId?: string }).apiId ?? e.id;
}

/**
 * House convention: moving someone to a new department re-points their
 * manager at that department's PIC — but only when their current
 * manager is unset or still tracking the OLD department's PIC. A
 * manager HR set deliberately is left alone.
 *
 * The case the original rule missed is a department's own PIC. Moving
 * the PIC of PX *into* PX set their manager to the PX PIC — themselves
 * — and the server rejects that outright with "Manager 1 cannot be the
 * employee themselves". The department change was therefore impossible
 * to save, for any PIC, into the department they lead. Worse, the
 * invalid value was written into the edit state first, so the Manager 1
 * picker rendered blank (an employee is excluded from their own manager
 * options, so the selected id matched nothing) while Manager 2 appeared
 * — the ladder looked corrupted before the save even failed.
 *
 * @returns the managerId to apply, or `undefined` to leave it untouched.
 *          `null` means "clear it" — the new department has no PIC.
 */
export function nextManagerForDeptChange(
  selfKey: string,
  currentManagerId: string | null,
  oldPic: string | null,
  newPic: string | null,
): string | null | undefined {
  // HR set this deliberately — don't second-guess it.
  const followsDeptPic = !currentManagerId || currentManagerId === oldPic;
  if (!followsDeptPic) return undefined;
  // They LEAD the department they're moving into. Nobody is their own
  // manager; leave the existing value for a human to decide rather than
  // writing a value the API will reject.
  if (newPic && newPic === selfKey) return undefined;
  if (newPic === currentManagerId) return undefined;
  return newPic;
}
