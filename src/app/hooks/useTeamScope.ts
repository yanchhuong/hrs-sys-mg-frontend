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
  /** True only for admin — admins have no scope applied. */
  const isTenantWide = isAdmin;

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
   */
  const matchesScope = (employeeId: string, mode: ScopeMode): boolean => {
    if (isTenantWide) return true; // admin ignores the picker
    if (mode === 'mine') return employeeId === myEmpId;
    if (mode === 'team') return employeeId !== myEmpId && (allowedEmployeeIds?.has(employeeId) ?? false);
    return allowedEmployeeIds === null || allowedEmployeeIds.has(employeeId);
  };

  /**
   * Approval guard. Admin always; everyone else must be the target's direct
   * leader (the target's `manager_id` equals the caller's own employee id).
   */
  const canApproveFor = (targetEmployeeId: string) => {
    if (isAdmin) return true;
    const target = mockEmployees.find(e => e.id === targetEmployeeId);
    return !!target && target.managerId === myEmpId;
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
