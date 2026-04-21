// Platform-level mock data — only the Super Admin sees this.
// In production these live in a separate "control plane" database and are
// never exposed to tenant admins.

export type PlanTier = 'free' | 'starter' | 'business' | 'enterprise';

/** Hard limits per plan. Super Admin enforces these across all tenants. */
export interface PlanLimits {
  maxEmployees: number;
  maxStorageMb: number;
  maxLocalInstalls: number;
  monthlyPriceUsd: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free:       { maxEmployees: 10,    maxStorageMb: 500,    maxLocalInstalls: 0,  monthlyPriceUsd: 0 },
  starter:    { maxEmployees: 50,    maxStorageMb: 2_000,  maxLocalInstalls: 1,  monthlyPriceUsd: 99 },
  business:   { maxEmployees: 250,   maxStorageMb: 10_000, maxLocalInstalls: 3,  monthlyPriceUsd: 399 },
  enterprise: { maxEmployees: 5_000, maxStorageMb: 100_000, maxLocalInstalls: 50, monthlyPriceUsd: 1299 },
};

export interface Usage {
  employees: { used: number; cap: number; pct: number; over: boolean };
  storage:   { used: number; cap: number; pct: number; over: boolean };
  installs:  { used: number; cap: number; pct: number; over: boolean };
}

export function computeUsage(company: Company, installs: LocalInstall[] = []): Usage {
  const limits = PLAN_LIMITS[company.planTier];
  const installCount = installs.filter(i => i.companyId === company.id).length;
  const mk = (used: number, cap: number) => ({
    used,
    cap,
    pct: cap > 0 ? Math.min(999, Math.round((used / cap) * 100)) : 0,
    over: used > cap,
  });
  return {
    employees: mk(company.employeeCount, limits.maxEmployees),
    storage:   mk(company.storageMb,     limits.maxStorageMb),
    installs:  mk(installCount,          limits.maxLocalInstalls),
  };
}

export type CompanyStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
export type SyncHealth = 'healthy' | 'degraded' | 'down' | 'never';

export interface Company {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  country: string;
  planTier: PlanTier;
  status: CompanyStatus;
  userCount: number;
  employeeCount: number;
  storageMb: number;
  monthlyCostUsd: number;
  createdAt: string;
  lastActiveAt: string;
  notes?: string;
}

export interface LocalInstall {
  id: string;
  companyId: string;
  siteName: string;
  apiKey: string;
  apiKeyLastFour: string;
  createdAt: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;
  syncHealth: SyncHealth;
  agentVersion: string;
  ipAddress?: string;
}

export interface PlatformUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'employee';
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface PlatformPolicy {
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
  ipAllowlist: string[];
  featureFlags: Record<string, boolean>;
}

export interface PlatformAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  target: string;
  at: string;
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------
export type BackupType = 'on-demand' | 'scheduled' | 'pre-restore' | 'pre-migration';
export type BackupScope = 'full' | 'incremental';
export type BackupStatus = 'in_progress' | 'completed' | 'failed';
export type StorageTarget = 's3' | 'gcs' | 'local-volume';

export interface Backup {
  id: string;
  tenantId: string;
  type: BackupType;
  scope: BackupScope;
  status: BackupStatus;
  sizeBytes: number;
  createdAt: string;
  completedAt?: string;
  retentionDays: number;
  expiresAt?: string;
  storageTarget: StorageTarget;
  storageUri: string;
  encryptionAlg: 'aes-256-gcm';
  checksumSha256?: string;
  triggeredBy: string;
  error?: string;
}

export interface BackupSchedule {
  tenantId: string;
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  runAtUtc: string;
  retentionDays: number;
  scope: BackupScope;
  storageTarget: StorageTarget;
  storageUri: string;
  encryptionKeyRef?: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface BackupPlanPolicy {
  maxRetentionDays: number;
  autoFrequency: BackupSchedule['frequency'] | 'none';
}

export const BACKUP_PLAN_POLICY: Record<PlanTier, BackupPlanPolicy> = {
  free:       { maxRetentionDays: 7,   autoFrequency: 'none' },
  starter:    { maxRetentionDays: 30,  autoFrequency: 'weekly' },
  business:   { maxRetentionDays: 90,  autoFrequency: 'daily' },
  enterprise: { maxRetentionDays: 365, autoFrequency: 'hourly' },
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
const randApiKey = (seed: string) => `pk_${seed}${Math.random().toString(36).slice(2, 10)}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 48);

export const mockCompanies: Company[] = [
  { id: 'T001', name: 'ACME Corporation',       slug: 'acme',       contactEmail: 'it@acme.com',       country: 'Cambodia', planTier: 'enterprise', status: 'active',    userCount: 48,  employeeCount: 120, storageMb: 2840, monthlyCostUsd: 899, createdAt: '2023-06-12T00:00:00', lastActiveAt: '2026-04-21T09:14:00' },
  { id: 'T002', name: 'Contoso Ltd',            slug: 'contoso',    contactEmail: 'hr@contoso.com',    country: 'Thailand', planTier: 'business',   status: 'active',    userCount: 21,  employeeCount: 64,  storageMb: 1120, monthlyCostUsd: 399, createdAt: '2024-02-02T00:00:00', lastActiveAt: '2026-04-21T08:31:00' },
  { id: 'T003', name: 'Fabrikam Industries',    slug: 'fabrikam',   contactEmail: 'admin@fabrikam.io', country: 'Vietnam',  planTier: 'starter',    status: 'active',    userCount: 8,   employeeCount: 22,  storageMb: 340,  monthlyCostUsd: 99,  createdAt: '2024-09-18T00:00:00', lastActiveAt: '2026-04-20T19:42:00' },
  { id: 'T004', name: 'Northwind Traders',      slug: 'northwind',  contactEmail: 'ops@northwind.co',  country: 'Singapore',planTier: 'business',   status: 'trial',     userCount: 4,   employeeCount: 15,  storageMb: 140,  monthlyCostUsd: 0,   createdAt: '2026-04-01T00:00:00', lastActiveAt: '2026-04-21T07:05:00', notes: 'Trial ends 2026-04-30' },
  { id: 'T005', name: 'Tailspin Toys',          slug: 'tailspin',   contactEmail: 'admin@tailspin.io', country: 'Laos',     planTier: 'starter',    status: 'suspended', userCount: 6,   employeeCount: 10,  storageMb: 80,   monthlyCostUsd: 0,   createdAt: '2025-01-10T00:00:00', lastActiveAt: '2026-03-14T12:00:00', notes: 'Non-payment — suspended 2026-03-20' },
  { id: 'T006', name: 'Wingtip Hospitality',    slug: 'wingtip',    contactEmail: 'it@wingtip.asia',   country: 'Malaysia', planTier: 'enterprise', status: 'active',    userCount: 72,  employeeCount: 210, storageMb: 4200, monthlyCostUsd: 1299,createdAt: '2023-11-04T00:00:00', lastActiveAt: '2026-04-21T09:58:00' },
  { id: 'T007', name: 'Proseware Analytics',    slug: 'proseware',  contactEmail: 'hr@proseware.dev',  country: 'Indonesia',planTier: 'business',   status: 'active',    userCount: 17,  employeeCount: 42,  storageMb: 620,  monthlyCostUsd: 399, createdAt: '2024-06-22T00:00:00', lastActiveAt: '2026-04-20T22:10:00' },
  { id: 'T008', name: 'Adventure Works',        slug: 'adventure',  contactEmail: 'payroll@aw.com',    country: 'Philippines', planTier: 'free',    status: 'cancelled', userCount: 0,   employeeCount: 0,   storageMb: 0,    monthlyCostUsd: 0,   createdAt: '2025-03-01T00:00:00', lastActiveAt: '2026-01-15T00:00:00', notes: 'Cancelled 2026-01-16' },
];

export const mockLocalInstalls: LocalInstall[] = [
  { id: 'L001', companyId: 'T001', siteName: 'ACME HQ',             apiKey: randApiKey('acmehq'), apiKeyLastFour: 'f7a2', createdAt: '2023-06-20T00:00:00', lastSyncAt: '2026-04-21T09:10:00', lastSyncStatus: 'ok',    syncHealth: 'healthy',  agentVersion: '1.4.2', ipAddress: '203.0.113.12' },
  { id: 'L002', companyId: 'T001', siteName: 'ACME Siem Reap',      apiKey: randApiKey('acmesr'), apiKeyLastFour: '4b91', createdAt: '2024-04-03T00:00:00', lastSyncAt: '2026-04-21T09:08:00', lastSyncStatus: 'ok',    syncHealth: 'healthy',  agentVersion: '1.4.2', ipAddress: '203.0.113.45' },
  { id: 'L003', companyId: 'T002', siteName: 'Contoso Bangkok',     apiKey: randApiKey('contoso'),apiKeyLastFour: '0c3e', createdAt: '2024-02-10T00:00:00', lastSyncAt: '2026-04-21T05:02:00', lastSyncStatus: 'error', lastSyncError: 'Connection timeout', syncHealth: 'degraded', agentVersion: '1.3.7', ipAddress: '198.51.100.22' },
  { id: 'L004', companyId: 'T003', siteName: 'Fabrikam Main',       apiKey: randApiKey('fabrik'), apiKeyLastFour: '82de', createdAt: '2024-09-25T00:00:00', lastSyncAt: '2026-04-21T08:40:00', lastSyncStatus: 'ok',    syncHealth: 'healthy',  agentVersion: '1.4.0' },
  { id: 'L005', companyId: 'T006', siteName: 'Wingtip KL',          apiKey: randApiKey('wingkl'), apiKeyLastFour: '1198', createdAt: '2023-12-15T00:00:00', lastSyncAt: '2026-04-21T09:40:00', lastSyncStatus: 'ok',    syncHealth: 'healthy',  agentVersion: '1.4.2' },
  { id: 'L006', companyId: 'T006', siteName: 'Wingtip Penang',      apiKey: randApiKey('wingpn'), apiKeyLastFour: 'a66c', createdAt: '2024-05-02T00:00:00', lastSyncAt: '2026-04-18T04:21:00', lastSyncStatus: 'error', lastSyncError: 'Authentication failed', syncHealth: 'down', agentVersion: '1.2.1' },
  { id: 'L007', companyId: 'T007', siteName: 'Proseware Jakarta',   apiKey: randApiKey('prose'),  apiKeyLastFour: 'de44', createdAt: '2024-06-30T00:00:00', lastSyncAt: '2026-04-20T23:50:00', lastSyncStatus: 'ok',    syncHealth: 'healthy',  agentVersion: '1.4.0' },
  { id: 'L008', companyId: 'T004', siteName: 'Northwind SG',        apiKey: randApiKey('nw'),     apiKeyLastFour: 'ff91', createdAt: '2026-04-02T00:00:00',                                                                                                                                                                                                            syncHealth: 'never',    agentVersion: '1.4.2' },
];

export const mockPlatformUsers: PlatformUser[] = [
  { id: 'U01', companyId: 'T001', email: 'admin@acme.com',        name: 'Chanra Meas',      role: 'admin',    isActive: true,  lastLogin: '2026-04-21T08:44:00', createdAt: '2023-06-12T00:00:00' },
  { id: 'U02', companyId: 'T001', email: 'hr@acme.com',           name: 'Srey Chan',        role: 'manager',  isActive: true,  lastLogin: '2026-04-21T08:40:00', createdAt: '2023-06-20T00:00:00' },
  { id: 'U03', companyId: 'T002', email: 'admin@contoso.com',     name: 'Samantha Kim',     role: 'admin',    isActive: true,  lastLogin: '2026-04-20T17:11:00', createdAt: '2024-02-02T00:00:00' },
  { id: 'U04', companyId: 'T002', email: 'payroll@contoso.com',   name: 'Rith Ly',          role: 'manager',  isActive: true,  lastLogin: '2026-04-19T14:02:00', createdAt: '2024-02-05T00:00:00' },
  { id: 'U05', companyId: 'T003', email: 'admin@fabrikam.io',     name: 'Thu Hà',           role: 'admin',    isActive: true,  lastLogin: '2026-04-21T07:14:00', createdAt: '2024-09-18T00:00:00' },
  { id: 'U06', companyId: 'T004', email: 'hr@northwind.co',       name: 'Priya Kumar',      role: 'admin',    isActive: true,  lastLogin: '2026-04-21T06:33:00', createdAt: '2026-04-01T00:00:00' },
  { id: 'U07', companyId: 'T005', email: 'admin@tailspin.io',     name: 'Daniel Vongsak',   role: 'admin',    isActive: false, lastLogin: '2026-03-10T09:00:00', createdAt: '2025-01-10T00:00:00' },
  { id: 'U08', companyId: 'T006', email: 'admin@wingtip.asia',    name: 'Azlan Rahman',     role: 'admin',    isActive: true,  lastLogin: '2026-04-21T09:52:00', createdAt: '2023-11-04T00:00:00' },
  { id: 'U09', companyId: 'T006', email: 'sg@wingtip.asia',       name: 'Mei Tan',          role: 'manager',  isActive: true,  lastLogin: '2026-04-21T09:10:00', createdAt: '2023-12-01T00:00:00' },
  { id: 'U10', companyId: 'T007', email: 'admin@proseware.dev',   name: 'Yusuf Sadikin',    role: 'admin',    isActive: true,  lastLogin: '2026-04-20T21:05:00', createdAt: '2024-06-22T00:00:00' },
];

export const defaultPlatformPolicy: PlatformPolicy = {
  passwordMinLength: 10,
  passwordRequireNumber: true,
  passwordRequireSymbol: true,
  passwordRequireUppercase: true,
  passwordExpiryDays: 90,
  mfaRequired: false,
  sessionTimeoutMinutes: 480,
  minSyncIntervalSeconds: 60,
  dataRetentionDays: 2555,
  auditLogRetentionDays: 365,
  ipAllowlistEnabled: false,
  ipAllowlist: [],
  featureFlags: {
    biometricLogin: true,
    customRoles: true,
    webhookIntegrations: false,
    advancedReports: true,
    bulkPayrollUpload: true,
  },
};

export const mockAuditTrail: PlatformAuditEntry[] = [
  { id: 'A01', actorEmail: 'platform@hrms.com',  action: 'Created tenant',             target: 'Northwind Traders',  at: '2026-04-01T10:14:00' },
  { id: 'A02', actorEmail: 'platform@hrms.com',  action: 'Suspended tenant',           target: 'Tailspin Toys',      at: '2026-03-20T15:40:00' },
  { id: 'A03', actorEmail: 'platform@hrms.com',  action: 'Rotated API key',            target: 'Contoso Bangkok',    at: '2026-03-18T09:02:00' },
  { id: 'A04', actorEmail: 'platform@hrms.com',  action: 'Updated password policy',    target: 'Global',             at: '2026-03-10T11:25:00' },
  { id: 'A05', actorEmail: 'platform@hrms.com',  action: 'Approved local install',     target: 'Wingtip Penang',     at: '2024-05-02T08:01:00' },
  { id: 'A06', actorEmail: 'platform@hrms.com',  action: 'Cancelled tenant',           target: 'Adventure Works',    at: '2026-01-16T13:15:00' },
  { id: 'A07', actorEmail: 'platform@hrms.com',  action: 'Revoked API key',            target: 'Wingtip Penang',     at: '2026-04-18T04:22:00' },
  { id: 'A08', actorEmail: 'platform@hrms.com',  action: 'Changed plan tier',          target: 'Contoso Ltd',        at: '2025-10-02T16:00:00' },
];

// ---------------------------------------------------------------------------
// Backup seed
// ---------------------------------------------------------------------------
const _bkHash = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`;
const _gb = (mb: number) => mb * 1024 * 1024;

export const mockBackups: Backup[] = [
  // ACME — enterprise with hourly backups
  { id: 'B001', tenantId: 'T001', type: 'scheduled',    scope: 'full',        status: 'completed',   sizeBytes: _gb(2840), createdAt: '2026-04-21T08:00:00', completedAt: '2026-04-21T08:14:22', retentionDays: 365, expiresAt: '2027-04-21T08:00:00', storageTarget: 's3', storageUri: 's3://hrms-backups/acme/2026-04-21T08.tar.zst',      encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(1),  triggeredBy: 'scheduler' },
  { id: 'B002', tenantId: 'T001', type: 'scheduled',    scope: 'incremental', status: 'completed',   sizeBytes: _gb(142),  createdAt: '2026-04-21T09:00:00', completedAt: '2026-04-21T09:02:08', retentionDays: 7,   expiresAt: '2026-04-28T09:00:00', storageTarget: 's3', storageUri: 's3://hrms-backups/acme/2026-04-21T09-inc.tar.zst',  encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(2),  triggeredBy: 'scheduler' },
  { id: 'B003', tenantId: 'T001', type: 'on-demand',    scope: 'full',        status: 'completed',   sizeBytes: _gb(2812), createdAt: '2026-04-18T14:22:00', completedAt: '2026-04-18T14:38:11', retentionDays: 365, expiresAt: '2027-04-18T14:22:00', storageTarget: 's3', storageUri: 's3://hrms-backups/acme/2026-04-18T14-manual.tar.zst',encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(3),  triggeredBy: 'platform@hrms.com' },

  // Contoso — business, daily
  { id: 'B004', tenantId: 'T002', type: 'scheduled',    scope: 'full',        status: 'completed',   sizeBytes: _gb(1120), createdAt: '2026-04-21T02:00:00', completedAt: '2026-04-21T02:06:44', retentionDays: 90,  expiresAt: '2026-07-20T02:00:00', storageTarget: 's3', storageUri: 's3://hrms-backups/contoso/2026-04-21T02.tar.zst',   encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(4),  triggeredBy: 'scheduler' },
  { id: 'B005', tenantId: 'T002', type: 'scheduled',    scope: 'full',        status: 'failed',      sizeBytes: 0,         createdAt: '2026-04-20T02:00:00', completedAt: '2026-04-20T02:01:12', retentionDays: 90,                                   storageTarget: 's3', storageUri: 's3://hrms-backups/contoso/2026-04-20T02.tar.zst',   encryptionAlg: 'aes-256-gcm',                             triggeredBy: 'scheduler', error: 'S3 bucket quota exceeded — rotate old backups' },

  // Fabrikam — starter, weekly
  { id: 'B006', tenantId: 'T003', type: 'scheduled',    scope: 'full',        status: 'completed',   sizeBytes: _gb(340),  createdAt: '2026-04-15T03:00:00', completedAt: '2026-04-15T03:01:54', retentionDays: 30,  expiresAt: '2026-05-15T03:00:00', storageTarget: 's3', storageUri: 's3://hrms-backups/fabrikam/2026-04-15T03.tar.zst',  encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(6),  triggeredBy: 'scheduler' },

  // Wingtip — enterprise, one in progress now
  { id: 'B007', tenantId: 'T006', type: 'scheduled',    scope: 'incremental', status: 'in_progress', sizeBytes: 0,         createdAt: '2026-04-21T09:55:00',                                      retentionDays: 7,                                                                storageTarget: 's3', storageUri: 's3://hrms-backups/wingtip/2026-04-21T09-55-inc.tar.zst', encryptionAlg: 'aes-256-gcm',                        triggeredBy: 'scheduler' },
  { id: 'B008', tenantId: 'T006', type: 'pre-migration',scope: 'full',        status: 'completed',   sizeBytes: _gb(4200), createdAt: '2026-04-10T01:00:00', completedAt: '2026-04-10T01:22:09', retentionDays: 365, expiresAt: '2027-04-10T01:00:00', storageTarget: 's3', storageUri: 's3://hrms-backups/wingtip/2026-04-10T01-pre-migration.tar.zst', encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(8), triggeredBy: 'scheduler' },

  // Proseware — business
  { id: 'B009', tenantId: 'T007', type: 'scheduled',    scope: 'full',        status: 'completed',   sizeBytes: _gb(620),  createdAt: '2026-04-21T02:30:00', completedAt: '2026-04-21T02:33:27', retentionDays: 90,  expiresAt: '2026-07-20T02:30:00', storageTarget: 's3', storageUri: 's3://hrms-backups/proseware/2026-04-21T02.tar.zst', encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(9),  triggeredBy: 'scheduler' },

  // Northwind — trial, one manual
  { id: 'B010', tenantId: 'T004', type: 'on-demand',    scope: 'full',        status: 'completed',   sizeBytes: _gb(140),  createdAt: '2026-04-19T11:40:00', completedAt: '2026-04-19T11:41:55', retentionDays: 30,  expiresAt: '2026-05-19T11:40:00', storageTarget: 's3', storageUri: 's3://hrms-backups/northwind/2026-04-19T11-manual.tar.zst', encryptionAlg: 'aes-256-gcm', checksumSha256: _bkHash(10), triggeredBy: 'platform@hrms.com' },
];

export const mockBackupSchedules: BackupSchedule[] = [
  { tenantId: 'T001', enabled: true,  frequency: 'hourly', runAtUtc: '00:00', retentionDays: 7,   scope: 'incremental', storageTarget: 's3', storageUri: 's3://hrms-backups/acme/',      lastRunAt: '2026-04-21T09:00:00', nextRunAt: '2026-04-21T10:00:00' },
  { tenantId: 'T002', enabled: true,  frequency: 'daily',  runAtUtc: '02:00', retentionDays: 90,  scope: 'full',        storageTarget: 's3', storageUri: 's3://hrms-backups/contoso/',   lastRunAt: '2026-04-21T02:00:00', nextRunAt: '2026-04-22T02:00:00' },
  { tenantId: 'T003', enabled: true,  frequency: 'weekly', runAtUtc: '03:00', retentionDays: 30,  scope: 'full',        storageTarget: 's3', storageUri: 's3://hrms-backups/fabrikam/',  lastRunAt: '2026-04-15T03:00:00', nextRunAt: '2026-04-22T03:00:00' },
  { tenantId: 'T006', enabled: true,  frequency: 'hourly', runAtUtc: '00:00', retentionDays: 7,   scope: 'incremental', storageTarget: 's3', storageUri: 's3://hrms-backups/wingtip/',   lastRunAt: '2026-04-21T09:00:00', nextRunAt: '2026-04-21T10:00:00' },
  { tenantId: 'T007', enabled: true,  frequency: 'daily',  runAtUtc: '02:30', retentionDays: 90,  scope: 'full',        storageTarget: 's3', storageUri: 's3://hrms-backups/proseware/', lastRunAt: '2026-04-21T02:30:00', nextRunAt: '2026-04-22T02:30:00' },
  { tenantId: 'T004', enabled: false, frequency: 'weekly', runAtUtc: '03:00', retentionDays: 14,  scope: 'full',        storageTarget: 's3', storageUri: 's3://hrms-backups/northwind/' },
];
