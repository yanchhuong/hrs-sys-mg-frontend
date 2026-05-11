import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockEmployees } from '../data/mockData';

/**
 * Tri-state picker value for leader-scoped views.
 *   - `all`  → self + direct reports (the default for leaders)
 *   - `mine` → only the caller's own records
 *   - `team` → only direct reports' records (excludes self)
 */
export type ScopeMode = 'all' | 'mine' | 'team';

/**
 * Leader-scoped visibility.
 *   - **Admin** sees the whole tenant (no scope, no picker).
 *   - **Manager / Employee** see self + direct reports by default. They can narrow
 *     with a {@link ScopeMode} picker.
 *
 * Approval (`canApproveFor`): admin anytime; everyone else only when they are
 * the target's direct leader.
 */
export function useTeamScope() {
  const { currentUser } = useAuth();
  const role = currentUser?.role;
  const myEmpId = currentUser?.employeeId;

  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isEmployee = role === 'employee';
  /**
   * True for Admin and every custom role. Built-in Manager / Employee
   * stay leader-scoped (self + direct reports). Custom roles are created
   * from the Admin base, so by default they get full data — the admin can
   * narrow per-module via the Permissions matrix instead of per-employee.
   */
  const isCustomRole = !!role && role !== 'admin' && role !== 'manager' && role !== 'employee';
  const isTenantWide = isAdmin || isCustomRole;

  const allowedEmployeeIds = useMemo(() => {
    if (isTenantWide) return null; // no scope — sees everything
    if (!myEmpId) return new Set<string>();
    const reports = mockEmployees
      .filter(e => e.managerId === myEmpId)
      .map(e => e.id);
    return new Set<string>([myEmpId, ...reports]);
  }, [isTenantWide, myEmpId]);

  const directReportCount = useMemo(() => {
    if (!myEmpId) return 0;
    return mockEmployees.filter(e => e.managerId === myEmpId).length;
  }, [myEmpId]);

  /** True when the current caller may see records owned by this employee. */
  const canViewEmployee = (employeeId: string) =>
    allowedEmployeeIds === null || allowedEmployeeIds.has(employeeId);

  /**
   * Narrower filter used alongside the base visibility scope. Applied on top
   * of `canViewEmployee` — returns true when the record matches the caller's
   * current picker choice.
   *
   * Optional {@code roster} param mirrors {@link canApproveFor} — passing
   * the live employees array lets the function resolve "self + direct
   * reports" from real data instead of {@link mockEmployees}. Without it,
   * a Manager in live mode only sees their own records (the mock fallback
   * doesn't know about their live team).
   */
  const matchesScope = (
    employeeId: string,
    mode: ScopeMode,
    roster?: ReadonlyArray<{ id: string; apiId?: string; managerId?: string | null }>,
  ): boolean => {
    if (isTenantWide) return true; // admin / custom roles see everything
    if (mode === 'mine') return employeeId === myEmpId;

    // Build the allowed set from the live roster when given, else mocks.
    let liveAllowed: Set<string> | null = null;
    if (roster && myEmpId) {
      liveAllowed = new Set<string>([myEmpId]);
      for (const e of roster) {
        if (e.managerId === myEmpId) {
          // Add both forms so callers can compare against either id shape.
          liveAllowed.add(e.id);
          if ((e as { apiId?: string }).apiId) liveAllowed.add((e as { apiId?: string }).apiId!);
        }
      }
    }
    const set = liveAllowed ?? allowedEmployeeIds;

    if (mode === 'team') return employeeId !== myEmpId && (set?.has(employeeId) ?? false);
    return set === null || set.has(employeeId);
  };

  /**
   * Approval guard — strictly leader-scoped. The caller must be the
   * target's direct leader (the target's `manager_id` equals the
   * caller's own employee id). Admin and tenant-wide custom roles get
   * full visibility but no approval bypass: they only see the
   * Approve / Reject buttons on rows that personally report to them.
   *
   * The optional {@code roster} param lets a live-data view (Overtime,
   * Exception, …) pass its loaded employees array. Without it, the function
   * falls back to {@link mockEmployees} — fine for mock mode but always
   * returns false in live mode because mock IDs don't match live UUIDs.
   * Pass the roster to make PIC-of-department approvals work in live mode:
   * once an employee is assigned to a department/team, their
   * {@code managerId} mirrors that unit's PIC, and that PIC can then
   * approve their OT / Leave from this gate.
   */
  const canApproveFor = (
    targetEmployeeId: string,
    roster?: ReadonlyArray<{ id: string; apiId?: string; managerId?: string | null }>,
  ) => {
    if (!myEmpId) return false;
    const list = roster ?? mockEmployees;
    const target = list.find(
      e => e.id === targetEmployeeId || (e as { apiId?: string }).apiId === targetEmployeeId,
    );
    if (!target?.managerId) return false;
    // In live mode the auth token gives us the caller's UUID and the
    // employees roster also stores managerId as UUID; in mock mode both
    // sides are empNos. Either way, the comparison is direct.
    return target.managerId === myEmpId;
  };

  return {
    role,
    myEmpId,
    isAdmin,
    isManager,
    isEmployee,
    isTenantWide,
    allowedEmployeeIds,
    directReportCount,
    isLeader: directReportCount > 0,
    canViewEmployee,
    matchesScope,
    canApproveFor,
    /** The picker is only meaningful when the user actually has records beyond their own. */
    showScopePicker: !isTenantWide && directReportCount > 0,
  };
}
