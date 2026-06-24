import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, UserRole } from '../types/hrms';
import { mockUsers, mockEmployees } from '../data/mockData';
import * as authApi from '../api/auth';
import * as rolesApi from '../api/roles';
import * as employeesApi from '../api/employees';
import * as platformApi from '../api/platform';
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
  /** Re-fetch /auth/me and update the cached currentUser. Used by
   *  the Profile dialog after the user updates their display name
   *  so the sidebar avatar / receipt cashier line refresh without
   *  a page reload. (V140) */
  refreshUser: () => Promise<void>;
  /** True when the user's tenant has the module enabled in Super Admin →
   *  Tenant Modules. Independent of role permissions: a module disabled
   *  by the platform hides the menu and rejects API calls regardless of
   *  the role grant. Defaults to true for unknown keys (e.g. before the
   *  flag list has finished loading) so we never accidentally blank
   *  the sidebar during the initial fetch. */
  isModuleEnabled: (module: string) => boolean;
  /** True when the module appears in the tenant's effective catalog
   *  (status='complete' on the platform side) AND is enabled for this
   *  tenant. False for drafts, unknown modules, or modules explicitly
   *  disabled. Use this when a UI section is gated on a sub-module
   *  that may or may not be in the catalog yet — isModuleEnabled
   *  defaults to true for unknown keys which would render the section
   *  even though the platform never declared it. */
  isModuleAvailable: (module: string) => boolean;
  /** True when Super Admin has enabled the top-bar Apps launcher for
   *  this tenant. Independent of the user's role — the launcher's UI
   *  additionally checks {@code currentUser.role === 'admin'} before
   *  rendering. Defaults to true while the bootstrap fetch is in
   *  flight so the icon doesn't flicker. */
  isAppLauncherEnabled: () => boolean;
  /** Resolve a category key (e.g. 'account', 'hr') to the human label
   *  the Super Admin set on the Module Categories page. Returns
   *  undefined when the platform doesn't know about the key — callers
   *  fall back to a hardcoded i18n label. */
  getModuleCategoryLabel: (key: string) => string | undefined;
  /** Tenant-admin self-service module install / uninstall. Throws on
   *  network / permission errors so callers can show a toast. */
  setModuleEnabled: (moduleKey: string, enabled: boolean) => Promise<void>;
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
  refreshUser: noopAsync,
  isModuleEnabled: () => true,
  isModuleAvailable: () => true,
  isAppLauncherEnabled: () => true,
  getModuleCategoryLabel: () => undefined,
  setModuleEnabled: noopAsync,
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
    name: apiUser.name,
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
   * Modules the tenant has explicitly disabled in Super Admin → Tenant
   * Modules. Absence of an entry = enabled (matches the backend's
   * default-on semantics). Null while still loading the first time so
   * the sidebar doesn't flicker hidden then shown on initial render.
   */
  const [disabledModules, setDisabledModules] = useState<Set<string> | null>(null);

  /**
   * Every module key the platform considers complete (real controller
   * behind it) for this tenant — i.e. the keys present in /me/modules
   * regardless of enabled/disabled value. Drafts + unknown keys are
   * NOT in this set. Lets consumers tell apart "module exists & is on"
   * vs "module is a planning placeholder" vs "key was never declared".
   */
  const [availableModules, setAvailableModules] = useState<Set<string> | null>(null);

  /**
   * Tenant-scope feature flags Super Admin toggles on the Companies
   * edit dialog. Null while still loading the first time so consumers
   * can default to "show" during bootstrap (matches the optimistic
   * behaviour of {@code isModuleAvailable}).
   */
  const [tenantFeatures, setTenantFeatures] = useState<platformApi.TenantFeatures | null>(null);

  /** Super-Admin-managed module categories (Module Categories page).
   *  Keyed by ISO-ish key (e.g. 'hr', 'account', 'admin'), each
   *  carries the human-friendly label the platform owner set. Drives
   *  the AppLauncher heading text — without this, the launcher fell
   *  back to a hardcoded i18n string and ignored Super Admin's
   *  rename. Null while loading; consumers default to the i18n label
   *  during bootstrap. */
  const [tenantCategories, setTenantCategories] = useState<platformApi.ModuleCategory[] | null>(null);

  /**
   * Hydrate or refresh the tenant's module-disabled set from /me/modules.
   * Mock mode and unauthenticated states resolve to an empty set so
   * isModuleEnabled returns true universally. Super admins never use a
   * tenant-scoped catalog (the Super Admin app runs on the platform
   * surface), so we skip the fetch entirely — calling /me/modules as a
   * platform principal returns 403 and would log scary console noise.
   */
  const loadModuleFlags = useCallback(async (role?: string): Promise<{
    disabled: Set<string>;
    available: Set<string>;
    features: platformApi.TenantFeatures | null;
    categories: platformApi.ModuleCategory[] | null;
  }> => {
    if (USE_MOCKS) return { disabled: new Set(), available: new Set(), features: null, categories: null };
    if (role === 'super_admin') return { disabled: new Set(), available: new Set(), features: null, categories: null };
    try {
      const res = await platformApi.myModules.get();
      const disabled = new Set<string>();
      const available = new Set<string>();
      for (const [k, on] of Object.entries(res.modules)) {
        available.add(k);
        if (!on) disabled.add(k);
      }
      return { disabled, available, features: res.features ?? null, categories: res.categories ?? null };
    } catch (err) {
      // Non-fatal — treat as nothing-disabled so the UI doesn't go blank
      // if the endpoint is briefly unreachable. The backend's gate is
      // the authoritative check; the frontend filter is convenience.
      console.warn('Failed to load /me/modules', err);
      return { disabled: new Set(), available: new Set(), features: null, categories: null };
    }
  }, []);

  /**
   * Fetch + adapt the role-permissions grid into a flat Set keyed by
   * `module:action`. Admin short-circuits to a wildcard set without a fetch.
   * Mock mode falls back to the seeded grids above.
   */
  const loadGrants = useCallback(async (role: string | undefined): Promise<Set<string>> => {
    if (!role) return new Set();
    if (role === 'admin') return new Set(['*']);
    // Platform principal: there's no tenant permission grid to fetch and
    // /roles/self/permissions would 403. Return wildcard so any local
    // `canDo` check defaults to allow — real Super Admin surfaces are
    // gated by the SuperAdmin app shell, not by canDo.
    if (role === 'super_admin') return new Set(['*']);
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
        // Run permission and module-flag fetches in parallel so the
        // initial paint isn't blocked twice on the network.
        const [g, m] = await Promise.all([loadGrants(user.role), loadModuleFlags(user.role)]);
        if (!cancelled) {
          setGrants(g);
          setDisabledModules(m.disabled);
          setAvailableModules(m.available);
          setTenantFeatures(m.features);
          setTenantCategories(m.categories);
        }
      } catch {
        authApi.logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadGrants, loadModuleFlags]);

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

  const isModuleEnabled = useCallback((module: string): boolean => {
    // Until /me/modules has responded, treat everything as enabled so
    // the sidebar doesn't render hidden then unhide on first load.
    if (disabledModules == null) return true;
    return !disabledModules.has(module);
  }, [disabledModules]);

  const isModuleAvailable = useCallback((module: string): boolean => {
    // Pre-fetch: optimistic so a slow /me/modules doesn't blank
    // gated sections during the initial paint.
    //
    // Empty-set fallback (size === 0) follows the same rule: a
    // tenant whose module_assignments hasn't been seeded yet, or a
    // /me/modules call that errored into the defensive {} return,
    // would otherwise blank the entire sidebar and bounce the user
    // onto a view they can't see ("Access denied"). The authoritative
    // gates are @perm.allow + TenantModuleGuard server-side; the
    // frontend filter is convenience, so being permissive here when
    // the catalog is missing is the right safety valve.
    if (availableModules == null || availableModules.size === 0) return true;
    // Post-fetch with a real catalog: the module must be declared
    // (so drafts + never-declared keys return false) AND not
    // explicitly disabled for this tenant.
    if (!availableModules.has(module)) return false;
    return !(disabledModules?.has(module) ?? false);
  }, [availableModules, disabledModules]);

  const canDo = useCallback((module: string, action: PermissionAction): boolean => {
    // Tenant-level module gate wins. Even an admin with role wildcard
    // can't act on a module the platform has disabled for the tenant.
    if (!isModuleEnabled(module)) return false;
    if (grants.has('*')) return true;
    return grants.has(`${module}:${action}`);
  }, [grants, isModuleEnabled]);

  /**
   * Dashboard used to be implicitly granted to every authenticated user
   * because legacy custom roles didn't have the row in their grid. The
   * Permission Matrix now exposes Dashboard as a regular column, so an
   * admin who unchecks it expects the menu to hide. Honour the grants
   * here — Layout's redirect-to-first-allowed-view effect handles the
   * "you have nowhere to land" edge case cleanly.
   */
  const canView   = useCallback(
    (m: string) => canDo(m, 'view'),
    [canDo],
  );
  const canCreate = useCallback((m: string) => canDo(m, 'create'), [canDo]);
  const canUpdate = useCallback((m: string) => canDo(m, 'update'), [canDo]);
  const canDelete = useCallback((m: string) => canDo(m, 'delete'), [canDo]);

  const refreshPermissions = useCallback(async () => {
    if (!currentUser) return;
    setGrants(await loadGrants(currentUser.role));
  }, [currentUser, loadGrants]);

  /** V140 — re-fetch /auth/me after the user updates their display
   *  name in the Profile dialog so the new label propagates to the
   *  sidebar avatar without a page reload. Silent on failure — the
   *  cached value stays put. */
  const refreshUser = useCallback(async () => {
    if (USE_MOCKS) return;
    try {
      const apiUser = await authApi.me();
      setCurrentUser(fromApi(apiUser));
    } catch { /* keep cached user */ }
  }, []);

  /** Tenant-scope Apps-launcher flag from /me/modules. Defaults to true
   *  while loading so the icon doesn't flicker hidden→shown on first
   *  paint; the actual role-side gate (admin only) is enforced by the
   *  AppLauncher component itself. */
  const isAppLauncherEnabled = useCallback((): boolean => {
    if (tenantFeatures == null) return true;
    return tenantFeatures.appLauncherEnabled !== false;
  }, [tenantFeatures]);

  const getModuleCategoryLabel = useCallback((key: string): string | undefined => {
    if (!tenantCategories) return undefined;
    return tenantCategories.find(c => c.key === key)?.label;
  }, [tenantCategories]);

  /** Tenant-admin self-service install / uninstall for a single
   *  module. Calls the {@code PUT /api/v1/me/modules/{key}} endpoint
   *  (admin-only on the backend) and merges the returned snapshot
   *  into local state so the sidebar + AppLauncher update without
   *  another fetch. The backend re-validates so any client tampering
   *  is harmless. */
  const setModuleEnabled = useCallback(async (moduleKey: string, enabled: boolean): Promise<void> => {
    if (USE_MOCKS) {
      // Mock mode: maintain the local set so the UI still demonstrates
      // the toggle, no server call.
      setDisabledModules(prev => {
        const next = new Set(prev ?? new Set<string>());
        if (enabled) next.delete(moduleKey); else next.add(moduleKey);
        return next;
      });
      return;
    }
    const res = await platformApi.myModules.setOne(moduleKey, enabled);
    // apiJson resolves undefined when the tenant gate denies the call
    // (shouldn't happen here since /me/modules is module-agnostic, but
    // guard anyway so a future gate change can't crash the toggle).
    if (!res) return;
    const disabled = new Set<string>();
    const available = new Set<string>();
    for (const [k, on] of Object.entries(res.modules)) {
      available.add(k);
      if (!on) disabled.add(k);
    }
    setDisabledModules(disabled);
    setAvailableModules(available);
    setTenantFeatures(res.features ?? null);
  }, []);

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
      const [g, m] = await Promise.all([loadGrants(user.role), loadModuleFlags(user.role)]);
      setGrants(g);
      setDisabledModules(m.disabled);
      setAvailableModules(m.available);
      setTenantFeatures(m.features);
      setTenantCategories(m.categories);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setGrants(new Set());
    setDisabledModules(null);
    setAvailableModules(null);
    setTenantFeatures(null);
    setTenantCategories(null);
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
      refreshUser,
      isModuleEnabled, isModuleAvailable, isAppLauncherEnabled, getModuleCategoryLabel, setModuleEnabled,
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
