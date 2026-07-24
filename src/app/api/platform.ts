import { apiJson, apiVoid } from './client';

// Every platform list endpoint returns a Spring-paginated envelope:
//   { data: T[], page, size, totalPages, totalElements }
// The frontend wants the flat array, so unwrap once here. Defensive against
// endpoints that return raw arrays — those just pass through.
type Paged<T> = { data: T[] } | T[];
const unwrap = <T>(r: Paged<T>): T[] =>
  Array.isArray(r) ? r : (r?.data ?? []);

// ---------------------------------------------------------------------------
// Tenants (Companies)
// ---------------------------------------------------------------------------
export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  planTier: string;        // 'starter' | 'business' | 'enterprise' | 'free'
  status: string;          // 'active' | 'trial' | 'suspended' | 'cancelled' | 'frozen'
  contactEmail: string;
  contactPhone: string;
  country: string;
  notes: string;
  /** Super-Admin toggle for the top-bar Apps launcher inside the tenant's
   *  app. UI shows it only when this is true AND the user is an Admin. */
  appLauncherEnabled: boolean;
  suspendedAt: string | null;
  cancelledAt: string | null;
  /** v-tenant-freeze — populated only when status='frozen'; cleared
   *  when the SA unfreezes. */
  frozenAt: string | null;
  frozenReason: string | null;
  frozenById: string | null;
  /** v-tenant-freeze-schedule — auto-thaw deadline (ISO). Null =
   *  indefinite freeze (SA lifts manually). */
  frozenUntil: string | null;
  /** V277 — v-tenant-freeze-schedule (deferred). When status='active'
   *  and this is set, a nightly cron flips the tenant to 'frozen' at
   *  this timestamp. Null once the freeze has fired (or when none is
   *  pending). */
  frozenFrom?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live counts surfaced in the Super Admin Companies page Usage column.
   *  Zero on create/update responses where they aren't computed. */
  employeeCount?: number;
  userCount?: number;
  attendanceCount?: number;
  payrollItemCount?: number;
  /** Approx bytes stored — attachments (file uploads) + inline base64
   *  image blobs on stock_items. Feeds the Companies page Storage
   *  column. Zero on create/update responses where it isn't computed. */
  storageBytes?: number;
  /** Derived Business Base(s) — subset of 'pos'/'school'/'hospital'.
   *  Populated on list + get + create + setBusinessBase responses.
   *  Empty array = "no industry" (rare but legal). V181. */
  businessBases?: BusinessBase[];
}

/** Business Base identifiers (V181, v-business-base-plumbing).
 *  Multi-select — a School with a canteen picks ['school', 'pos'].
 *  Common modules (User / Employee / Payment / Invoice / Expense
 *  etc.) are always on; only industry sidebar groups are Base-gated. */
export type BusinessBase = 'pos' | 'school' | 'hospital';

export interface CreateTenantRequest {
  name: string;
  slug: string;
  planTier: string;
  contactEmail: string;
  contactPhone?: string | null;
  country?: string | null;
  notes?: string | null;
  initialAdmin?: { email: string; password: string; name: string } | null;
  /** Optional. When present, the backend seeds tenant_modules so only
   *  the chosen Bases' industry modules are enabled. Omit / empty →
   *  legacy behaviour (every Base-scoped module stays default-on). */
  businessBases?: BusinessBase[];
}

export interface UpdateTenantRequest {
  name?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  notes?: string;
  /** When set, the backend validates against plan_limits and applies. */
  planTier?: string;
  /** Super-Admin Apps-launcher toggle. Omit to leave unchanged. */
  appLauncherEnabled?: boolean;
}

export interface ListTenantsParams {
  q?: string;
  status?: string;
  planTier?: string;
}

export const tenants = {
  list: (params: ListTenantsParams = {}): Promise<PlatformTenant[]> =>
    apiJson<Paged<PlatformTenant>>('/api/v1/platform/tenants', { query: { ...params } }).then(unwrap),
  get: (id: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}`),
  create: (req: CreateTenantRequest): Promise<PlatformTenant> =>
    apiJson('/api/v1/platform/tenants', { method: 'POST', json: req }),
  update: (id: string, req: UpdateTenantRequest): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}`, { method: 'PATCH', json: req }),
  suspend: (id: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/suspend`, { method: 'POST' }),
  reactivate: (id: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/reactivate`, { method: 'POST' }),
  /** v-tenant-freeze — Super Admin flips tenant into "orders paused".
   *  All times are ISO-8601 strings.
   *  - {@code frozenFrom} — optional. Future = deferred schedule; the
   *    tenant stays active until then and auto-flips to frozen on/after
   *    that date. Null / omitted / past = freeze immediately.
   *  - {@code frozenUntil} — optional. Auto-thaw deadline. Null =
   *    indefinite (SA lifts manually). */
  freeze: (id: string, opts?: {
    reason?: string | null;
    frozenFrom?: string | null;
    frozenUntil?: string | null;
  }): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/freeze`, {
      method: 'POST',
      json: {
        ...(opts?.reason ? { reason: opts.reason } : {}),
        ...(opts?.frozenFrom  ? { frozenFrom:  opts.frozenFrom  } : {}),
        ...(opts?.frozenUntil ? { frozenUntil: opts.frozenUntil } : {}),
      },
    }),
  unfreeze: (id: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/unfreeze`, { method: 'POST' }),
  changePlan: (id: string, planTier: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/plan`, { method: 'PATCH', json: { planTier } }),
  /** Switch a tenant's Business Base atomically. Empty array is a
   *  legitimate "no industry" state — every Base-scoped module ends
   *  up disabled and only Common modules remain visible. V181. */
  setBusinessBase: (id: string, bases: BusinessBase[]): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/business-base`, { method: 'PUT', json: { bases } }),
  remove: (id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/tenants/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Plan limits
// ---------------------------------------------------------------------------
export interface PlanLimits {
  planTier: string;
  maxEmployees: number;
  maxStorageMb: number;
  maxLocalInstalls: number;
  monthlyPriceCents: number;
  /** Returned by the list endpoint — count of tenants currently on this
   *  plan. Drives the Adoption column and gates the delete button. */
  tenantsOnPlan?: number;
}

export interface PlanRequest {
  /** Required on create, ignored on update (plan_tier is the PK and
   *  carried in the URL on PUT, so the body field is silently dropped). */
  planTier: string;
  maxEmployees: number;
  maxStorageMb: number;
  maxLocalInstalls: number;
  monthlyPriceCents: number;
}

export const plans = {
  list: (): Promise<PlanLimits[]> =>
    apiJson<Paged<PlanLimits>>('/api/v1/platform/plans').then(unwrap),
  create: (req: PlanRequest): Promise<PlanLimits> =>
    apiJson('/api/v1/platform/plans', { method: 'POST', json: req }),
  update: (planTier: string, req: PlanRequest): Promise<PlanLimits> =>
    apiJson(`/api/v1/platform/plans/${encodeURIComponent(planTier)}`, {
      method: 'PUT', json: req,
    }),
  /** Backend returns 409 with a "N tenants are on this plan…" message
   *  when the plan is still in use; surface that to the admin. */
  remove: (planTier: string): Promise<void> =>
    apiVoid(`/api/v1/platform/plans/${encodeURIComponent(planTier)}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Cross-tenant users
// ---------------------------------------------------------------------------
export interface PlatformUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  tenantSlug: string | null;
  /** Display name from `tenants.name`. Prefer over slug for the
   *  Company column; the Super Admin UI falls back to slug when
   *  name is null/blank (legacy tenants without a name set). */
  tenantName?: string | null;
  isActive: boolean;
  lastLogin: string | null;
  /** V266 — throttled activity heartbeat. Null on legacy users that
   *  never hit an authenticated endpoint since the column was added. */
  lastSeen?: string | null;
  /** V266 — derived server-side. True when {@link lastSeen} is within
   *  the last 5 minutes. */
  online?: boolean;
  createdAt: string;
}

export interface ListUsersParams {
  tenantId?: string;
  q?: string;
  role?: string;
  /** V266 — 'online' / 'offline' / 'all' (or omit). Filters the
   *  Super Admin Users list to only rows currently online / offline. */
  online?: 'online' | 'offline' | 'all';
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: string;
  tenantId: string;
}

export const users = {
  list: (params: ListUsersParams = {}): Promise<PlatformUser[]> =>
    apiJson<Paged<PlatformUser>>('/api/v1/platform/users', { query: { ...params } }).then(unwrap),
  /** Add a user under an existing tenant. For role=admin under a *new*
   *  tenant, use {@link tenants.create} with `initialAdmin` populated —
   *  that creates the tenant and the first admin atomically. */
  create: (req: CreateUserRequest): Promise<PlatformUser> =>
    apiJson('/api/v1/platform/users', { method: 'POST', json: req }),
  /** Returns the cleartext temporary password — shown to admin once. */
  resetPassword: (id: string): Promise<{ temporaryPassword: string }> =>
    apiJson(`/api/v1/platform/users/${id}/reset-password`, { method: 'POST' }),
  suspend: (id: string): Promise<PlatformUser> =>
    apiJson(`/api/v1/platform/users/${id}/suspend`, { method: 'POST' }),
  reactivate: (id: string): Promise<PlatformUser> =>
    apiJson(`/api/v1/platform/users/${id}/reactivate`, { method: 'POST' }),
  /** Hard-delete a user. Backend rejects with 409 if the user has linked
   *  records (audit / approvals); UI should suggest suspending instead. */
  remove: (id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/users/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Local installs (Connect & Sync)
// ---------------------------------------------------------------------------
export interface LocalInstall {
  id: string;
  tenantId: string;
  siteName: string;
  apiKeyLastFour: string;
  agentVersion: string | null;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;        // 'ok' | 'error' | 'pending' | 'never'
  lastSyncError: string | null;
  syncHealth: string;            // 'healthy' | 'degraded' | 'down' | 'never'
  revokedAt: string | null;
  /** Comma-separated allowlist of source IPs / CIDR ranges that the
   *  install's API key is permitted from. Null/blank = any IP. */
  allowedIps: string | null;
  /** Source IP of the install's most recent authenticated request.
   *  Refreshed by ApiKeyAuthFilter on every successful key match. */
  lastIpAddress: string | null;
}

export interface CreateInstallRequest {
  tenantId: string;
  siteName: string;
  /** Comma-separated allowlist of source IPs / CIDR ranges. Empty = any IP. */
  allowedIps?: string;
}

export interface UpdateInstallRequest {
  siteName?: string;
  /** Empty string clears the allowlist (any IP). */
  allowedIps?: string;
}

export interface InstallWithKey {
  install: LocalInstall;
  apiKey: string;     // cleartext, shown ONCE
  warning: string;
}

export const installs = {
  list: (tenantId?: string): Promise<LocalInstall[]> =>
    apiJson<Paged<LocalInstall>>('/api/v1/platform/installs', { query: tenantId ? { tenantId } : {} }).then(unwrap),
  create: (req: CreateInstallRequest): Promise<InstallWithKey> =>
    apiJson('/api/v1/platform/installs', { method: 'POST', json: req }),
  update: (id: string, req: UpdateInstallRequest): Promise<LocalInstall> =>
    apiJson(`/api/v1/platform/installs/${id}`, { method: 'PATCH', json: req }),
  rotateKey: (id: string): Promise<InstallWithKey> =>
    apiJson(`/api/v1/platform/installs/${id}/rotate-key`, { method: 'POST' }),
  revoke: (id: string): Promise<LocalInstall> =>
    apiJson(`/api/v1/platform/installs/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Activity log (cross-tenant audit trail)
// ---------------------------------------------------------------------------
export interface PlatformAuditEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  tenantId: string | null;
  payload: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
}

export interface ListActivityParams {
  tenantId?: string;
  action?: string;
  unacked?: boolean;
  from?: string;     // ISO datetime
  to?: string;
}

export const activity = {
  list: (params: ListActivityParams = {}): Promise<PlatformAuditEntry[]> =>
    apiJson<Paged<PlatformAuditEntry>>('/api/v1/platform/activity', { query: { ...params } }).then(unwrap),
  acknowledge: (id: string): Promise<PlatformAuditEntry> =>
    apiJson(`/api/v1/platform/activity/${id}/ack`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------
export type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type BackupScope = 'tenant' | 'department' | 'custom';
export type StorageTarget = 's3' | 'gcs' | 'azure' | 'local';

export interface Backup {
  id: string;
  tenantId: string;
  type: 'manual' | 'scheduled';
  scope: BackupScope;
  status: BackupStatus;
  sizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
  retentionDays: number;
  expiresAt: string | null;
  storageTarget: StorageTarget;
  storageUri: string | null;
  encryptionAlg: string | null;
  checksumSha256: string | null;
  triggeredByUserId: string | null;
  error: string | null;
  /** 0-100 while the worker is running; null before/after. */
  progressPercent: number | null;
  /** Human label of the current phase, e.g. "dumping payroll_items (8/12)". */
  phase: string | null;
  /** ISO timestamp of projected completion; UI shows "X min remaining". */
  estimatedCompletionAt: string | null;
}

export interface CreateBackupRequest {
  tenantId: string;
  scope?: BackupScope;
  retentionDays?: number;
  storageTarget?: StorageTarget;
}

export interface BackupSchedule {
  tenantId: string;
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  runAtUtc: string;        // HH:mm
  retentionDays: number;
  scope: BackupScope;
  storageTarget: StorageTarget;
  storageUri: string | null;
  encryptionKeyRef: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

export const backups = {
  list: (params: { tenantId?: string; status?: BackupStatus } = {}): Promise<Backup[]> =>
    apiJson<Paged<Backup>>('/api/v1/platform/backups', { query: { ...params } }).then(unwrap),
  get: (id: string): Promise<Backup> =>
    apiJson(`/api/v1/platform/backups/${id}`),
  create: (req: CreateBackupRequest): Promise<Backup> =>
    apiJson('/api/v1/platform/backups', { method: 'POST', json: req }),
  /** Returns the download URL relative path; caller appends to API base. */
  downloadUrl: (id: string): string => `/api/v1/platform/backups/${id}/download`,
  restore: (id: string): Promise<Backup> =>
    apiJson(`/api/v1/platform/backups/${id}/restore`, { method: 'POST' }),
  remove: (id: string): Promise<void> =>
    apiVoid(`/api/v1/platform/backups/${id}`, { method: 'DELETE' }),

  schedules: {
    list: (tenantId?: string): Promise<BackupSchedule[]> =>
      apiJson<Paged<BackupSchedule>>('/api/v1/platform/backup-schedule', { query: tenantId ? { tenantId } : {} }).then(unwrap),
    upsert: (tenantId: string, sched: Omit<BackupSchedule, 'tenantId' | 'lastRunAt' | 'nextRunAt' | 'updatedAt'>): Promise<BackupSchedule> =>
      apiJson(`/api/v1/platform/backup-schedule/${tenantId}`, { method: 'PUT', json: sched }),
    remove: (tenantId: string): Promise<void> =>
      apiVoid(`/api/v1/platform/backup-schedule/${tenantId}`, { method: 'DELETE' }),
  },
};

// ---------------------------------------------------------------------------
// Platform-wide policy
// ---------------------------------------------------------------------------
export interface PlatformPolicy {
  id: number;
  passwordMinLength: number;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordRequireUppercase: boolean;
  passwordExpiryDays: number;
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  minSyncIntervalSeconds: number;
  dataRetentionDays: number;
  auditLogRetentionDays: number;
  ipAllowlistEnabled: boolean;
  featureFlags: Record<string, unknown> | null;
  updatedAt: string;
  updatedBy: string | null;
}

export const policy = {
  get: (): Promise<PlatformPolicy> => apiJson('/api/v1/platform/policy'),
  update: (req: Partial<Omit<PlatformPolicy, 'id' | 'updatedAt' | 'updatedBy'>>): Promise<PlatformPolicy> =>
    apiJson('/api/v1/platform/policy', { method: 'PUT', json: req }),
};

// ---------------------------------------------------------------------------
// Sync state — Super Admin's "100% in sync" / drift indicator per tenant
// ---------------------------------------------------------------------------
export interface TableSyncRow {
  table: string;
  localCount: number;
  cloudCount: number;
  /** local minus cloud. Positive = local has extra rows. */
  drift: number;
  lastSyncedAt: string;
  lastLocalUpdatedAt: string | null;
}

export interface TenantSyncState {
  tenantId: string;
  lastSyncedAt: string | null;
  /** true = a heartbeat has been received AND every reported table matches. */
  inSync: boolean;
  totalDrift: number;
  tables: TableSyncRow[];
}

export const syncState = {
  byTenant: (tenantId: string): Promise<TenantSyncState> =>
    apiJson(`/api/v1/platform/sync-state/${tenantId}`),
};

// ---------------------------------------------------------------------------
// Tenant Modules — Super Admin → Tenant Modules
// Per-tenant feature flags layered on top of the role-permissions matrix.
// Cloud absence of a key = enabled by default; UI renders the catalog so a
// stale client never has to guess which modules exist.
// ---------------------------------------------------------------------------
/**
 * One node in the module catalog tree. {@code status='complete'} are
 * green (real controller behind the key); {@code 'draft'} are orange
 * (planning placeholder, no controller yet). {@code source='code'}
 * nodes are auto-seeded from the backend's ALL_MODULES list and
 * locked (can't delete from UI, status can't be flipped to draft);
 * {@code 'manual'} nodes are admin-created planning entries.
 */
export interface ModuleNode {
  key: string;
  label: string;
  status: 'complete' | 'draft';
  source: 'code' | 'manual';
  /** Direct sub-menus. Nesting is unbounded. */
  children: ModuleNode[];
}

/** One category in the Super Admin grouping (e.g. HR Management). */
export interface ModuleCategory {
  key: string;
  label: string;
  /** Top-level module nodes under this category. */
  modules: ModuleNode[];
}

export interface TenantModulesPayload {
  tenantId: string;
  catalog: string[];
  modules: Record<string, boolean>;
  /** Optional — older deploys may omit; UI falls back to a single flat
   *  group containing every catalog entry. */
  categories?: ModuleCategory[];
}

export const tenantModules = {
  get: (tenantId: string): Promise<TenantModulesPayload> =>
    apiJson(`/api/v1/platform/tenant-modules?tenantId=${tenantId}`),

  /** Bulk set — absent keys are left untouched on the server. */
  set: (tenantId: string, modules: Record<string, boolean>): Promise<TenantModulesPayload> =>
    apiJson(`/api/v1/platform/tenant-modules?tenantId=${tenantId}`, {
      method: 'PUT',
      json: modules,
    }),
};

// Tenant-side read used by AuthContext to hydrate the user's effective
// module list at login so disabled menus drop out of the sidebar.
export interface MyModulesPayload {
  catalog: string[];
  modules: Record<string, boolean>;
  categories?: ModuleCategory[];
  /** Tenant-scope feature flags Super Admin can toggle on the
   *  Companies edit dialog. Optional so older API deploys keep working. */
  features?: TenantFeatures;
}

export interface TenantFeatures {
  appLauncherEnabled: boolean;
  /** True when at least one agency has an active engagement with
   *  this tenant. Drives visibility of agency-collaboration UI on
   *  the tenant sidebar (Tax Declarations). Optional for API
   *  back-compat with older deploys. */
  hasActiveAgency?: boolean;
}

export const myModules = {
  get: (): Promise<MyModulesPayload> =>
    apiJson('/api/v1/me/modules'),

  /** Tenant-admin self-service install / uninstall. Backed by the
   *  same {@code tenant_modules} table Super Admin writes to — admin
   *  flips the flag for the whole company. Returns the fresh snapshot
   *  so the caller can update its local state in one round-trip. */
  setOne: (moduleKey: string, enabled: boolean): Promise<MyModulesPayload> =>
    apiJson(`/api/v1/me/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'PUT',
      json: { enabled },
    }),
};

// ---------------------------------------------------------------------------
// Module Categories — Super Admin → Module Categories
// Manages the platform-wide module groupings (HR, Payroll, Admin, …).
// Modules themselves are code-defined; this surface only sets how they're
// presented to tenants and which app/category they group under.
// ---------------------------------------------------------------------------
export interface ModuleCategoryRow {
  key: string;
  label: string;
  sortOrder: number;
}

export interface ModuleCatalogResponse {
  allModules: string[];
  categories: ModuleCategory[];
}

/** Row returned by module CRUD. The tree-view comes from `list()`. */
export interface ModuleDetail {
  key: string;
  label: string;
  categoryKey: string;
  parentModuleKey: string | null;
  status: 'complete' | 'draft';
  sortOrder: number;
  source: 'code' | 'manual';
}

export const moduleCategories = {
  list: (): Promise<ModuleCatalogResponse> =>
    apiJson('/api/v1/platform/module-categories'),

  create: (req: { key: string; label: string; sortOrder?: number }): Promise<ModuleCategoryRow> =>
    apiJson('/api/v1/platform/module-categories', { method: 'POST', json: req }),

  update: (key: string, req: { label?: string; sortOrder?: number }): Promise<ModuleCategoryRow> =>
    apiJson(`/api/v1/platform/module-categories/${encodeURIComponent(key)}`, { method: 'PUT', json: req }),

  delete: (key: string): Promise<void> =>
    apiVoid(`/api/v1/platform/module-categories/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  /* Module-level CRUD (planning placeholders + reassignment). */
  createModule: (req: {
    key: string; label: string; categoryKey: string;
    parentModuleKey?: string | null; status?: 'complete' | 'draft'; sortOrder?: number;
  }): Promise<ModuleDetail> =>
    apiJson('/api/v1/platform/module-categories/modules', { method: 'POST', json: req }),

  updateModule: (moduleKey: string, req: {
    label?: string; status?: 'complete' | 'draft';
    parentModuleKey?: string | null; sortOrder?: number; categoryKey?: string;
  }): Promise<ModuleDetail> =>
    apiJson(`/api/v1/platform/module-categories/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'PUT', json: req,
    }),

  deleteModule: (moduleKey: string): Promise<void> =>
    apiVoid(`/api/v1/platform/module-categories/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'DELETE',
    }),

  /** Atomic bulk-reorder of modules in one sibling group. Send the new
   *  sequence as {key, sortOrder} pairs; the server rewrites them in
   *  one transaction so concurrent readers never see a half-reordered
   *  tree. */
  reorderModules: (items: Array<{ key: string; sortOrder: number }>): Promise<void> =>
    apiVoid('/api/v1/platform/module-categories/modules/reorder', {
      method: 'POST',
      json: { items },
    }),

  /** Same shape as {@link reorderModules} but for top-level categories. */
  reorderCategories: (items: Array<{ key: string; sortOrder: number }>): Promise<void> =>
    apiVoid('/api/v1/platform/module-categories/reorder', {
      method: 'POST',
      json: { items },
    }),

  /** Convenience wrapper for the most common edit: move a module to a
   *  different category (keeps everything else as-is). */
  reassign: (moduleKey: string, categoryKey: string): Promise<ModuleDetail> =>
    apiJson(`/api/v1/platform/module-categories/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'PUT', json: { categoryKey, parentModuleKey: '' },
    }),
};
