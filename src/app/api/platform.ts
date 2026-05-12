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
  status: string;          // 'active' | 'trial' | 'suspended' | 'cancelled'
  contactEmail: string;
  contactPhone: string;
  country: string;
  notes: string;
  suspendedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live counts surfaced in the Super Admin Companies page Usage column.
   *  Zero on create/update responses where they aren't computed. */
  employeeCount?: number;
  userCount?: number;
  attendanceCount?: number;
  payrollItemCount?: number;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  planTier: string;
  contactEmail: string;
  contactPhone?: string | null;
  country?: string | null;
  notes?: string | null;
  initialAdmin?: { email: string; password: string; name: string } | null;
}

export interface UpdateTenantRequest {
  name?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  notes?: string;
  /** When set, the backend validates against plan_limits and applies. */
  planTier?: string;
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
  changePlan: (id: string, planTier: string): Promise<PlatformTenant> =>
    apiJson(`/api/v1/platform/tenants/${id}/plan`, { method: 'PATCH', json: { planTier } }),
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
  createdAt: string;
}

export interface ListUsersParams {
  tenantId?: string;
  q?: string;
  role?: string;
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
