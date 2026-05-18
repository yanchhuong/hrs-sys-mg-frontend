import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, UserRole } from '../types/hrms';
import { mockUsers, mockEmployees } from '../data/mockData';
import * as authApi from '../api/auth';
import * as rolesApi from '../api/roles';
import * as employeesApi from '../api/employees';
import { USE_MOCKS } from '../api/client';
import { Employee } from '../types/hrms';

export interface LoginResult {
  success: boolean;
  error?: string;
}

export type PermissionAction = 'view' | 'create' | 'update' | 'delete';

interface AuthContextType {
  currentUser: User | null;
  currentEmployee: ReturnType<typeof mockEmployees.find> | null;
  loading: boolean;
  /** True if the current user can perform `action` on `module`. */
  canDo: (module: string, action: PermissionAction) => boolean;
  /** Shorthand for `canDo(module, 'view')`. */
  canView: (module: string) => boolean;
  /** Shorthand for `canDo(module, 'create')`. */
  canCreate: (module: string) => boolean;
  /** Shorthand for `canDo(module, 'update')`. */
  canUpdate: (module: string) => boolean;
  /** Shorthand for `canDo(module, 'delete')`. */
  canDelete: (module: string) => boolean;
  /** Force-refetch the current role's permission grid (e.g. after the matrix changes). */
  refreshPermissions: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const denyAll = () => false;
const noopAsync = async () => {};

const defaultAuthContext: AuthContextType = {
  currentUser: null,
  currentEmployee: null,
  loading: false,
  canDo: denyAll,
  canView: denyAll,
  canCreate: denyAll,
  canUpdate: denyAll,
  canDelete: denyAll,
  refreshPermissions: noopAsync,
  login: async () => ({ success: false }),
  logout: () => {},
  switchRole: () => {},
};

/**
 * Built-in mock-mode permission grids — generated on the fly to mirror the
 * V4 seed defaults. Wildcard `*` means full V/C/U/D on every module.
 */
const MOCK_GRIDS: Record<string, Set<string>> = (() => {
  const allActions: PermissionAction[] = ['view', 'create', 'update', 'delete'];
  const make = (mods: string[], actions: PermissionAction[] = allActions): Set<string> => {
    const out = new Set<string>();
    mods.forEach(m => actions.forEach(a => out.add(`${m}:${a}`)));
    return out;
  };
  return {
    admin: new Set(['*']),
    manager: make([
      'dashboard', 'employees', 'attendance', 'exception', 'overtime',
      'payroll', 'reports', 'contracts', 'settings',
    ]).add('deduction:view').add('increase:view'),
    employee: make(
      ['dashboard', 'employees', 'attendance', 'payroll', 'contracts'],
      ['view'],
    ).add('exception:view').add('exception:create').add('overtime:view').add('overtime:create'),
  };
})();

/** Translate the API's AuthUser into the frontend's User shape. */
function fromApi(apiUser: authApi.AuthUser): User {
  return {
    id: apiUser.id,
    email: apiUser.email,
    password: '',
    role: apiUser.role as UserRole,
    employeeId: apiUser.employeeId ?? '',
    createdAt: new Date().toISOString(),
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Set of `module:action` strings the current role is granted, e.g.
   * "attendance:view", "payroll:update". The wildcard `*` (admin) means
   * every check returns true.
   */
  const [grants, setGrants] = useState<Set<string>>(new Set());

  /**
   * Fetch + adapt the role-permissions grid into a flat Set keyed by
   * `module:action`. Admin short-circuits to a wildcard set without a fetch.
   * Mock mode falls back to the seeded grids above.
   */
  const loadGrants = useCallback(async (role: string | undefined): Promise<Set<string>> => {
    if (!role) return new Set();
    if (role === 'admin') return new Set(['*']);
    if (USE_MOCKS) return new Set(MOCK_GRIDS[role] ?? new Set());
    try {
      // The 'self' route lets a non-admin caller fetch their own grid
      // without admin permission. Backend resolves it from the JWT, so we
      // don't have to interpolate the role key into the URL.
      const grid = await rolesApi.getPermissions('self');
      return new Set(grid.filter(p => p.granted).map(p => `${p.module}:${p.action}`));
    } catch (err) {
      // Non-fatal — fall back to a deny-all set so the user isn't stranded
      // with broken nav. They can re-login if their role was deleted.
      console.warn('Failed to load permissions for role', role, err);
      return new Set();
    }
  }, []);

  // Rehydrate from the JWT cached by authApi — keeps sessions across reloads.
  // We can't trust the token's *presence* alone: it may be expired (8h TTL) or
  // signed by a previous JWT_SECRET. Verify by calling /auth/me; on 401 the
  // apiJson 401 handler clears the token and we fall through to LoginPage.
  useEffect(() => {
    if (USE_MOCKS) {
      setLoading(false);
      return;
    }
    if (!authApi.isAuthenticated()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const apiUser = await authApi.me();
        if (cancelled) return;
        const user = fromApi(apiUser);
        setCurrentUser(user);
        const g = await loadGrants(user.role);
        if (!cancelled) setGrants(g);
      } catch {
        authApi.logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadGrants]);

  // Linked employee fetched from /api/v1/employees/me in live mode. Without
  // this, currentEmployee fell back to mockEmployees and never matched a
  // real backend UUID — every consumer (Profile dialog, Dashboard
  // "Welcome back, …", etc.) saw blanks for non-mock users.
  const [linkedEmployee, setLinkedEmployee] = useState<Employee | null>(null);
  useEffect(() => {
    if (USE_MOCKS) { setLinkedEmployee(null); return; }
    if (!currentUser?.employeeId) { setLinkedEmployee(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const me = await employeesApi.me();
        if (cancelled) return;
        // Adapt the api/employees shape to the FE Employee shape consumers
        // expect (id = empNo, apiId = backend UUID, dept stored as id).
        setLinkedEmployee({
          id: me.empNo,
          apiId: me.id,
          empNo: me.empNo,
          name: me.name,
          khmerName: me.khmerName ?? undefined,
          email: me.email,
          position: me.position,
          department: me.departmentId ?? '-',
          joinDate: me.joinDate,
          status: (me.status === 'active' ? 'active' : 'inactive') as Employee['status'],
          contactNumber: me.contactNumber ?? '',
          baseSalary: me.baseSalary,
          managerId: me.managerId ?? undefined,
          profileImage: me.profileImage ?? undefined,
          gender: (me.gender === 'male' || me.gender === 'female') ? me.gender : undefined,
          dateOfBirth: me.dateOfBirth ?? undefined,
          placeOfBirth: me.placeOfBirth ?? undefined,
          currentAddress: me.currentAddress ?? undefined,
          nffNo: me.nffNo ?? undefined,
          tid: me.tid ?? undefined,
          contractExpireDate: me.contractExpireDate ?? undefined,
          resignDate: me.resignDate ?? undefined,
          attendanceYn: me.attendanceYn ?? true,
          positionAllowance: me.positionAllowance ?? 0,
          evaluationAllowance: me.evaluationAllowance ?? 0,
        });
      } catch (err) {
        // Non-fatal — the dialog still renders with blank fields, same as
        // before this fix. Most likely cause: user has no linked employee.
        console.warn('Could not load /employees/me', err);
        if (!cancelled) setLinkedEmployee(null);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.employeeId]);

  const currentEmployee = USE_MOCKS
    ? (currentUser ? mockEmployees.find(emp => emp.id === currentUser.employeeId) ?? null : null)
    : linkedEmployee;

  const canDo = useCallback((module: string, action: PermissionAction): boolean => {
    if (grants.has('*')) return true;
    return grants.has(`${module}:${action}`);
  }, [grants]);

  /**
   * Dashboard is the universal landing page — every authenticated user is
   * routed to it on login and the Dashboard component handles its own
   * per-role rendering (admin / manager / employee / custom role). Some
   * older custom roles were created without a `dashboard:view` row in
   * their grid, which made App.tsx render the "Access denied" card the
   * moment they logged in. Treat dashboard:view as implicitly granted to
   * any authenticated user so the sidebar shows it and the routing layer
   * lets it through. Other modules still gate normally.
   */
  const canView   = useCallback(
    (m: string) => m === 'dashboard' || canDo(m, 'view'),
    [canDo],
  );
  const canCreate = useCallback((m: string) => canDo(m, 'create'), [canDo]);
  const canUpdate = useCallback((m: string) => canDo(m, 'update'), [canDo]);
  const canDelete = useCallback((m: string) => canDo(m, 'delete'), [canDo]);

  const refreshPermissions = useCallback(async () => {
    if (!currentUser) return;
    setGrants(await loadGrants(currentUser.role));
  }, [currentUser, loadGrants]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    if (USE_MOCKS) {
      const user = mockUsers.find(u => u.email === email && u.password === password);
      if (user) {
        setCurrentUser(user);
        setGrants(await loadGrants(user.role));
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials' };
    }
    try {
      const apiUser = await authApi.login({ email, password });
      const user = fromApi(apiUser);
      setCurrentUser(user);
      setGrants(await loadGrants(user.role));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setGrants(new Set());
    authApi.logout();
  };

  // Dev-only role toggle — only meaningful against the mock user list.
  const switchRole = async (role: UserRole) => {
    if (!USE_MOCKS) return;
    const user = mockUsers.find(u => u.role === role);
    if (user) {
      setCurrentUser(user);
      setGrants(await loadGrants(role));
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser, currentEmployee, loading,
      canDo, canView, canCreate, canUpdate, canDelete,
      refreshPermissions,
      login, logout, switchRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) return defaultAuthContext;
  return context;
}
