import {
  mockAuditTrail, mockCompanies, mockLocalInstalls, mockPlatformUsers,
} from '../../../data/platformData';

export type Severity = 'info' | 'warning' | 'error';
export type EventCategory =
  | 'sync'        // Sync API calls, errors, retries
  | 'auth'        // Login, logout, failed auth
  | 'admin'       // Super admin actions
  | 'tenant'      // Tenant admin actions surfaced up
  | 'policy'      // Policy changes
  | 'system';     // Background jobs, backups, etc.

export interface ActivityEvent {
  id: string;
  at: string;              // ISO timestamp
  severity: Severity;
  category: EventCategory;
  action: string;          // Short verb phrase
  actor: string;           // Email / system name
  target: string;          // Human-readable target
  tenantId?: string;       // Links event to a company
  tenantName?: string;
  installId?: string;      // Links sync errors to a local install
  message?: string;        // Detail line / error body
  acknowledged: boolean;
}

/**
 * Derive a realistic audit stream from existing mock data. This lets the log
 * reflect whatever is currently happening in the other views — the install
 * that shows 'Authentication failed' in Sync Monitor produces an 'error' row
 * here, etc.
 */
export function buildActivityLog(): ActivityEvent[] {
  const items: ActivityEvent[] = [];
  const tenantById = new Map(mockCompanies.map(c => [c.id, c]));

  // 1. Sync API errors — the most important signal for Super Admin.
  mockLocalInstalls.forEach(inst => {
    const tenant = tenantById.get(inst.companyId);
    if (inst.lastSyncStatus === 'error' && inst.lastSyncAt) {
      items.push({
        id: `evt-sync-${inst.id}`,
        at: inst.lastSyncAt,
        severity: 'error',
        category: 'sync',
        action: 'Sync API failed',
        actor: inst.siteName,
        target: tenant?.name ?? 'Unknown tenant',
        tenantId: inst.companyId,
        tenantName: tenant?.name,
        installId: inst.id,
        message: inst.lastSyncError ?? 'Unknown error',
        acknowledged: false,
      });
    } else if (inst.lastSyncStatus === 'ok' && inst.lastSyncAt) {
      items.push({
        id: `evt-sync-ok-${inst.id}`,
        at: inst.lastSyncAt,
        severity: 'info',
        category: 'sync',
        action: 'Sync completed',
        actor: inst.siteName,
        target: tenant?.name ?? 'Unknown tenant',
        tenantId: inst.companyId,
        tenantName: tenant?.name,
        installId: inst.id,
        message: `Agent v${inst.agentVersion}`,
        acknowledged: true,
      });
    }
  });

  // 2. Install-created events (never-synced + created recently)
  mockLocalInstalls
    .filter(i => i.syncHealth === 'never')
    .forEach(inst => {
      const tenant = tenantById.get(inst.companyId);
      items.push({
        id: `evt-install-created-${inst.id}`,
        at: inst.createdAt,
        severity: 'info',
        category: 'admin',
        action: 'Local install registered',
        actor: 'platform@hrms.com',
        target: `${inst.siteName} — ${tenant?.name ?? ''}`,
        tenantId: inst.companyId,
        tenantName: tenant?.name,
        installId: inst.id,
        message: 'Awaiting first sync',
        acknowledged: true,
      });
    });

  // 3. Audit trail (existing) mapped into this shape.
  mockAuditTrail.forEach(a => {
    items.push({
      id: `evt-audit-${a.id}`,
      at: a.at,
      severity: 'info',
      category: a.action.toLowerCase().includes('policy') ? 'policy'
              : a.action.toLowerCase().includes('tenant') || a.action.toLowerCase().includes('company') ? 'admin'
              : 'admin',
      action: a.action,
      actor: a.actorEmail,
      target: a.target,
      acknowledged: true,
    });
  });

  // 4. Login events derived from lastLogin timestamps. Only include active users.
  mockPlatformUsers.filter(u => u.isActive && u.lastLogin).forEach(u => {
    const tenant = tenantById.get(u.companyId);
    items.push({
      id: `evt-login-${u.id}`,
      at: u.lastLogin!,
      severity: 'info',
      category: 'auth',
      action: 'User logged in',
      actor: u.email,
      target: tenant?.name ?? 'Unknown tenant',
      tenantId: u.companyId,
      tenantName: tenant?.name,
      acknowledged: true,
    });
  });

  // 5. A few synthetic auth failures to make the log realistic.
  const now = new Date('2026-04-21T09:30:00');
  const synthFail = [
    { email: 'admin@acme.com',    ms: 20 * 60_000, reason: 'Wrong password (3/5 attempts)', tenantId: 'T001' },
    { email: 'hr@contoso.com',    ms: 40 * 60_000, reason: 'Expired token', tenantId: 'T002' },
    { email: 'admin@fabrikam.io', ms: 90 * 60_000, reason: 'MFA code mismatch', tenantId: 'T003' },
  ];
  synthFail.forEach((f, idx) => {
    const tenant = tenantById.get(f.tenantId);
    items.push({
      id: `evt-auth-fail-${idx}`,
      at: new Date(now.getTime() - f.ms).toISOString(),
      severity: 'warning',
      category: 'auth',
      action: 'Failed login',
      actor: f.email,
      target: tenant?.name ?? f.tenantId,
      tenantId: f.tenantId,
      tenantName: tenant?.name,
      message: f.reason,
      acknowledged: false,
    });
  });

  // 6. A system event or two.
  items.push({
    id: 'evt-sys-backup',
    at: '2026-04-21T02:00:00',
    severity: 'info',
    category: 'system',
    action: 'Nightly backup completed',
    actor: 'backup-worker',
    target: 'All tenants',
    message: 'Snapshotted 8 tenants in 14m 22s',
    acknowledged: true,
  });
  items.push({
    id: 'evt-sys-certrenew',
    at: '2026-04-18T03:12:00',
    severity: 'info',
    category: 'system',
    action: 'TLS certificate renewed',
    actor: 'caddy',
    target: 'hrms.example.com',
    acknowledged: true,
  });

  // Newest first.
  items.sort((a, b) => b.at.localeCompare(a.at));
  return items;
}
