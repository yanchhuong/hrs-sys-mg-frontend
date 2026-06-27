import { useEffect, useMemo, useState } from 'react';
import { useDateFormat } from '../../../context/DateFormatContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Database, HardDrive, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Download, RotateCcw, Trash2, Calendar, Shield, Plus, Search, Play,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Backup, BackupSchedule, BackupStatus, BackupType, StorageTarget,
  BACKUP_PLAN_POLICY, mockBackups, mockBackupSchedules, mockCompanies,
} from '../../../data/platformData';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../common/Pagination';
import { USE_MOCKS, API_BASE } from '../../../api/client';
import * as platformApi from '../../../api/platform';

// Adapter: map a live Backup (api/platform.ts) to the page's mock Backup shape
// so the existing JSX, status icons and badges keep working without churn.
// Live "manual" → page "on-demand"; live "tenant"/"department"/"custom" scope
// is collapsed to "full" since the page only renders full vs incremental.
function toPageBackup(b: platformApi.Backup): Backup {
  const type: BackupType = b.type === 'manual' ? 'on-demand' : 'scheduled';
  return {
    id: b.id,
    tenantId: b.tenantId,
    type,
    scope: 'full',
    status: b.status === 'pending' ? 'in_progress' : (b.status as BackupStatus),
    sizeBytes: b.sizeBytes ?? 0,
    createdAt: b.createdAt,
    completedAt: b.completedAt ?? undefined,
    retentionDays: b.retentionDays,
    expiresAt: b.expiresAt ?? undefined,
    storageTarget: (b.storageTarget === 'azure' ? 'gcs' : b.storageTarget === 'local' ? 'local-volume' : b.storageTarget) as StorageTarget,
    storageUri: b.storageUri ?? '',
    encryptionAlg: 'aes-256-gcm',
    checksumSha256: b.checksumSha256 ?? undefined,
    triggeredBy: b.triggeredByUserId ?? 'scheduler',
    error: b.error ?? undefined,
    progressPercent: b.progressPercent ?? undefined,
    phase: b.phase ?? undefined,
    estimatedCompletionAt: b.estimatedCompletionAt ?? undefined,
  };
}

// Adapter: map a live BackupSchedule to the page's mock BackupSchedule shape.
function toPageSchedule(s: platformApi.BackupSchedule): BackupSchedule {
  return {
    tenantId: s.tenantId,
    enabled: s.enabled,
    frequency: s.frequency,
    runAtUtc: s.runAtUtc,
    retentionDays: s.retentionDays,
    scope: 'full',
    storageTarget: (s.storageTarget === 'azure' ? 'gcs' : s.storageTarget === 'local' ? 'local-volume' : s.storageTarget) as StorageTarget,
    storageUri: s.storageUri ?? '',
    encryptionKeyRef: s.encryptionKeyRef ?? undefined,
    lastRunAt: s.lastRunAt ?? undefined,
    nextRunAt: s.nextRunAt ?? undefined,
  };
}

export function Backups() {
  const { formatDate } = useDateFormat();
  const [backups, setBackups] = useState<Backup[]>(USE_MOCKS ? mockBackups : []);
  const [schedules, setSchedules] = useState<BackupSchedule[]>(
    USE_MOCKS ? mockBackupSchedules : [],
  );
  const [companies, setCompanies] = useState(
    USE_MOCKS ? mockCompanies : [] as typeof mockCompanies,
  );

  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [statusTab, setStatusTab] = useState<'all' | BackupStatus>('all');

  // On-demand dialog
  const [backupDialog, setBackupDialog] = useState(false);
  const [bkTenant, setBkTenant] = useState<string>('');
  const [bkScope, setBkScope] = useState<'full' | 'incremental'>('full');

  // Delete + restore targets
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');

  const companyById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);

  // Reload backups + schedules from the API. Re-runs when the server-side
  // filters (tenant + status tab) change; search is still applied in-memory.
  const loadBackups = async () => {
    if (USE_MOCKS) {
      setBackups(mockBackups);
      return;
    }
    try {
      const list = await platformApi.backups.list({
        tenantId: tenantFilter !== 'all' ? tenantFilter : undefined,
        status: statusTab !== 'all'
          ? (statusTab as platformApi.BackupStatus)
          : undefined,
      });
      setBackups(list.map(toPageBackup));
    } catch { /* leave previous backups in place */ }
  };

  const loadSchedules = async () => {
    if (USE_MOCKS) {
      setSchedules(mockBackupSchedules);
      return;
    }
    try {
      const list = await platformApi.backups.schedules.list();
      setSchedules(list.map(toPageSchedule));
    } catch { /* leave previous schedules in place */ }
  };

  // Initial fetch — tenants for the picker + the two collections.
  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      try {
        const ts = await platformApi.tenants.list();
        if (cancelled) return;
        // Cast through unknown — page JSX only reads fields that exist on
        // PlatformTenant (id, name, slug, planTier, status). Storage/cost
        // figures fall back to undefined and the table simply renders dashes.
        setCompanies(ts as unknown as typeof mockCompanies);
      } catch { /* fall back to empty list */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantFilter, statusTab]);

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while any backup is running so the progress bar advances. The
  // worker updates progress_percent / phase / estimated_completion_at in
  // its own REQUIRES_NEW transactions, so a 1.5s GET on /backups picks
  // up each per-table tick. Stops as soon as nothing is in_progress.
  useEffect(() => {
    if (USE_MOCKS) return;
    const anyRunning = backups.some(b => b.status === 'in_progress');
    if (!anyRunning) return;
    const t = setInterval(() => { void loadBackups(); }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backups]);

  const stats = useMemo(() => {
    const completed = backups.filter(b => b.status === 'completed');
    const totalBytes = completed.reduce((s, b) => s + b.sizeBytes, 0);
    const nextScheduled = schedules.filter(s => s.enabled && s.nextRunAt)
      .map(s => s.nextRunAt!).sort()[0];
    const lastFail = [...backups].reverse().find(b => b.status === 'failed');
    return {
      total: backups.length,
      completed: completed.length,
      inProgress: backups.filter(b => b.status === 'in_progress').length,
      failed: backups.filter(b => b.status === 'failed').length,
      totalBytes,
      nextScheduled,
      lastFail,
    };
  }, [backups, schedules]);

  const counts: Record<'all' | BackupStatus, number> = {
    all: backups.length,
    completed: stats.completed,
    in_progress: stats.inProgress,
    failed: stats.failed,
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...backups]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter(b => {
        if (statusTab !== 'all' && b.status !== statusTab) return false;
        if (tenantFilter !== 'all' && b.tenantId !== tenantFilter) return false;
        if (q) {
          const company = companyById.get(b.tenantId);
          const hay = `${company?.name ?? ''} ${b.type} ${b.scope} ${b.storageUri} ${b.triggeredBy}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [backups, search, statusTab, tenantFilter, companyById]);

  const pager = usePagination(filtered, 10);

  // ---------------------------------------------------------------------------
  const handleTriggerBackup = async () => {
    if (!bkTenant) {
      toast.error('Pick a tenant');
      return;
    }
    const company = companyById.get(bkTenant);
    if (USE_MOCKS) {
      const now = new Date();
      const id = `B${String(backups.length + 100).padStart(3, '0')}`;
      const newBackup: Backup = {
        id,
        tenantId: bkTenant,
        type: 'on-demand',
        scope: bkScope,
        status: 'in_progress',
        sizeBytes: 0,
        createdAt: now.toISOString(),
        retentionDays: BACKUP_PLAN_POLICY[company?.planTier ?? 'free'].maxRetentionDays,
        storageTarget: 's3',
        storageUri: `s3://hrms-backups/${company?.slug ?? 'tenant'}/${now.toISOString()}-manual.tar.zst`,
        encryptionAlg: 'aes-256-gcm',
        triggeredBy: 'platform@hrms.com',
      };
      setBackups(prev => [newBackup, ...prev]);
      setBackupDialog(false);
      toast.success(`Backup started for ${company?.name}`);
      // Simulate completion after a moment
      setTimeout(() => {
        setBackups(prev => prev.map(b =>
          b.id === id
            ? {
                ...b,
                status: 'completed',
                completedAt: new Date().toISOString(),
                sizeBytes: (bkScope === 'full' ? (company?.storageMb ?? 0) : 150) * 1024 * 1024,
                checksumSha256: `sha256:${Math.random().toString(16).slice(2).padStart(64, '0').slice(0, 64)}`,
                expiresAt: new Date(Date.now() + b.retentionDays * 86400_000).toISOString(),
              }
            : b
        ));
        toast.success(`Backup completed for ${company?.name}`);
      }, 2500);
      return;
    }
    try {
      const retentionDays = BACKUP_PLAN_POLICY[company?.planTier ?? 'free'].maxRetentionDays;
      await platformApi.backups.create({
        tenantId: bkTenant,
        scope: 'tenant',
        retentionDays,
        storageTarget: 's3',
      });
      setBackupDialog(false);
      toast.success(`Backup started for ${company?.name ?? bkTenant}`);
      await loadBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start backup';
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (USE_MOCKS) {
      setBackups(prev => prev.filter(b => b.id !== deleteTarget.id));
      toast.success('Backup deleted');
      setDeleteTarget(null);
      return;
    }
    try {
      await platformApi.backups.remove(deleteTarget.id);
      toast.success('Backup deleted');
      setDeleteTarget(null);
      await loadBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete backup';
      toast.error(msg);
    }
  };

  const handleDownload = (b: Backup) => {
    if (USE_MOCKS) {
      toast.success(`Generating download link for ${b.id}…`);
      return;
    }
    // Admins are already authenticated via Bearer token; opening in a new
    // window lets the browser stream the archive directly from the API.
    const url = `${API_BASE}${platformApi.backups.downloadUrl(b.id)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const company = companyById.get(restoreTarget.tenantId);
    if (restoreConfirm.trim() !== company?.name) {
      toast.error('Tenant name did not match — restore cancelled');
      return;
    }
    if (USE_MOCKS) {
      toast.success(`Restore of "${company?.name}" from ${format(new Date(restoreTarget.createdAt), 'MMM dd, HH:mm')} started. Tenant will be suspended for 2-5 minutes.`);
      setRestoreTarget(null);
      setRestoreConfirm('');
      return;
    }
    try {
      await platformApi.backups.restore(restoreTarget.id);
      toast.success(`Restore of "${company?.name}" from ${format(new Date(restoreTarget.createdAt), 'MMM dd, HH:mm')} started. Tenant will be suspended for 2-5 minutes.`);
      setRestoreTarget(null);
      setRestoreConfirm('');
      await loadBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start restore';
      toast.error(msg);
    }
  };

  const handleRetry = async (b: Backup) => {
    if (USE_MOCKS) {
      setBackups(prev => prev.map(x =>
        x.id === b.id
          ? { ...x, status: 'in_progress', error: undefined, createdAt: new Date().toISOString() }
          : x
      ));
      toast.success(`Retrying backup ${b.id}…`);
      return;
    }
    try {
      // Live retry = create a fresh backup with the same tenant + retention.
      await platformApi.backups.create({
        tenantId: b.tenantId,
        scope: 'tenant',
        retentionDays: b.retentionDays,
        storageTarget: 's3',
      });
      toast.success(`Retrying backup for ${companyById.get(b.tenantId)?.name ?? b.tenantId}`);
      await loadBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retry backup';
      toast.error(msg);
    }
  };

  const handleRunSchedule = (tenantId: string) => {
    const company = companyById.get(tenantId);
    setBkTenant(tenantId);
    setBkScope('full');
    toast.success(`Manual backup queued for ${company?.name}`);
    setBackupDialog(true);
  };

  const handleToggleSchedule = async (tenantId: string, enabled: boolean) => {
    const current = schedules.find(s => s.tenantId === tenantId);
    if (USE_MOCKS) {
      setSchedules(prev => prev.map(s =>
        s.tenantId === tenantId ? { ...s, enabled } : s
      ));
      toast.success(enabled ? 'Schedule enabled' : 'Schedule paused');
      return;
    }
    if (!current) {
      toast.error('Schedule not found');
      return;
    }
    try {
      await platformApi.backups.schedules.upsert(tenantId, {
        enabled,
        frequency: current.frequency,
        runAtUtc: current.runAtUtc,
        retentionDays: current.retentionDays,
        scope: 'tenant',
        storageTarget: (current.storageTarget === 'local-volume' ? 'local' : current.storageTarget) as platformApi.StorageTarget,
        storageUri: current.storageUri || null,
        encryptionKeyRef: current.encryptionKeyRef ?? null,
      });
      toast.success(enabled ? 'Schedule enabled' : 'Schedule paused');
      await loadSchedules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update schedule';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <StatCard label="Total backups"   value={stats.total}          Icon={Database}   tone="gray" />
        <StatCard label="Total stored"    value={formatBytes(stats.totalBytes)} Icon={HardDrive} tone="blue" />
        <StatCard label="In progress"     value={stats.inProgress}     Icon={RefreshCw}  tone="amber" spin={stats.inProgress > 0} />
        <StatCard label="Failed"          value={stats.failed}         Icon={XCircle}    tone={stats.failed > 0 ? 'red' : 'gray'} />
      </div>

      {/* Failed alert */}
      {stats.lastFail && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-red-50 border border-red-200">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-red-900">
              Backup failed for {companyById.get(stats.lastFail.tenantId)?.name ?? 'a tenant'}
            </p>
            <p className="text-sm text-red-800 truncate" title={stats.lastFail.error}>{stats.lastFail.error}</p>
          </div>
          <Button variant="outline" onClick={() => handleRetry(stats.lastFail!)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Backup Archive</CardTitle>
              <CardDescription>
                {stats.nextScheduled
                  ? <>Next scheduled backup <strong>{formatDistanceToNow(new Date(stats.nextScheduled), { addSuffix: true })}</strong></>
                  : 'No schedules configured.'}
              </CardDescription>
            </div>
            <Button onClick={() => { setBkTenant(''); setBkScope('full'); setBackupDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Backup Now
            </Button>
          </div>

          <Tabs value={statusTab} onValueChange={v => setStatusTab(v as typeof statusTab)}>
            <TabsList>
              <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts.all}</Badge></TabsTrigger>
              <TabsTrigger value="completed">Completed <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-green-100 text-green-800">{counts.completed}</Badge></TabsTrigger>
              <TabsTrigger value="in_progress">Running <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-blue-100 text-blue-800">{counts.in_progress}</Badge></TabsTrigger>
              <TabsTrigger value="failed">Failed <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-100 text-red-800">{counts.failed}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tenant, type, URI…"
                className="pl-8 h-9"
              />
            </div>
            <select
              value={tenantFilter}
              onChange={e => setTenantFilter(e.target.value)}
              className="h-9 px-3 border rounded-md text-sm min-w-[180px]"
            >
              <option value="all">All tenants</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.paginatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-400 py-10">
                    No backups match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pager.paginatedItems.map(b => {
                const company = companyById.get(b.tenantId);
                return (
                  <TableRow
                    key={b.id}
                    className={b.status === 'failed' ? 'bg-red-50/40' : b.status === 'in_progress' ? 'bg-blue-50/40' : ''}
                  >
                    <TableCell><StatusIcon status={b.status} /></TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{company?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{b.triggeredBy}</p>
                      {b.status === 'in_progress' && (
                        <div className="mt-1.5 space-y-1 max-w-[280px]">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${b.progressPercent ?? 0}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-gray-600 flex items-center gap-1.5">
                            <span className="font-mono tabular-nums">{b.progressPercent ?? 0}%</span>
                            {b.phase && <span className="text-gray-500 truncate" title={b.phase}>· {b.phase}</span>}
                            {b.estimatedCompletionAt && (
                              <span className="text-gray-500 ml-auto whitespace-nowrap">
                                · {formatRemaining(b.estimatedCompletionAt)}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <TypeBadge type={b.type} />
                        <Badge variant="outline" className="text-[10px] capitalize">{b.scope}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>{formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}</p>
                      <p className="text-gray-400">{format(new Date(b.createdAt), 'MMM dd, HH:mm')}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {b.status === 'completed' ? formatBytes(b.sizeBytes) : <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.expiresAt ? (
                        <>
                          <p>{b.retentionDays}d</p>
                          <p className="text-gray-400">exp {formatDate(b.expiresAt)}</p>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <code className="text-[10px] text-gray-600">{b.storageTarget}</code>
                      {b.error && (
                        <p className="text-red-700 text-[10px] truncate max-w-[160px]" title={b.error}>{b.error}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === 'completed' && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(b)} title="Download">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50" onClick={() => setRestoreTarget(b)} title="Restore">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {b.status === 'failed' && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-50" onClick={() => handleRetry(b)} title="Retry">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(b)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={pager.currentPage}
            totalPages={pager.totalPages}
            onPageChange={pager.goToPage}
            startIndex={pager.startIndex}
            endIndex={pager.endIndex}
            totalItems={pager.totalItems}
          />
        </CardContent>
      </Card>

      {/* Schedules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Backup Schedules
          </CardTitle>
          <CardDescription>
            Retention caps follow each tenant's plan. Enterprise → 365d / hourly · Business → 90d / daily · Starter → 30d / weekly · Free → 7d / manual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan cap</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map(s => {
                const company = companyById.get(s.tenantId);
                const policy = BACKUP_PLAN_POLICY[company?.planTier ?? 'free'];
                return (
                  <TableRow key={s.tenantId}>
                    <TableCell>
                      <p className="font-medium text-sm">{company?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400 capitalize">{company?.planTier}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p>up to {policy.maxRetentionDays}d</p>
                      <p className="text-gray-400 capitalize">auto: {policy.autoFrequency}</p>
                    </TableCell>
                    <TableCell className="capitalize text-sm">{s.frequency}</TableCell>
                    <TableCell className="text-sm">{s.retentionDays}d</TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {s.lastRunAt ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true }) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.enabled && s.nextRunAt
                        ? formatDistanceToNow(new Date(s.nextRunAt), { addSuffix: true })
                        : <span className="text-gray-400">paused</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={(v) => handleToggleSchedule(s.tenantId, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleRunSchedule(s.tenantId)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Run now
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Encryption info */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium text-sm">Encryption at rest: AES-256-GCM</p>
              <p className="text-xs text-gray-500">
                Per-tenant data keys, wrapped by the platform master key in KMS. Keys rotated quarterly.
              </p>
            </div>
          </div>
          <Badge className="bg-green-100 text-green-800 gap-1">
            <CheckCircle className="h-3 w-3" />
            Enabled
          </Badge>
        </CardContent>
      </Card>

      {/* Backup Now dialog */}
      <Dialog open={backupDialog} onOpenChange={setBackupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a backup now</DialogTitle>
            <DialogDescription>
              Runs immediately. The tenant stays fully available; read-replica snapshot is used so writes aren't blocked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tenant</Label>
              <select
                value={bkTenant}
                onChange={e => setBkTenant(e.target.value)}
                className="w-full h-9 px-3 border rounded-md text-sm"
              >
                <option value="">Select a tenant…</option>
                {companies.filter(c => c.status !== 'cancelled').map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.planTier})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['full', 'incremental'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setBkScope(s)}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      bkScope === s ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-sm capitalize">{s}</p>
                    <p className="text-[11px] text-gray-500">
                      {s === 'full'
                        ? 'Complete snapshot of tenant data + schema.'
                        : 'Changes since last successful full/incremental.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupDialog(false)}>Cancel</Button>
            <Button onClick={handleTriggerBackup} disabled={!bkTenant}>
              <Database className="h-4 w-4 mr-2" />
              Start backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              The archive at <code className="text-xs">{deleteTarget?.storageUri}</code> is removed permanently. The tenant's live data is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation — more dangerous, type-to-confirm */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestoreConfirm(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-900">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Restore tenant data
            </DialogTitle>
            <DialogDescription>
              Tenant data will be replaced with the contents of this backup. All changes since the backup time will be lost. The tenant will be <strong>suspended during restore</strong> (typically 2-5 minutes).
            </DialogDescription>
          </DialogHeader>
          {restoreTarget && (() => {
            const company = companyById.get(restoreTarget.tenantId);
            return (
              <div className="space-y-4">
                <div className="rounded-md border p-3 bg-gray-50 text-sm space-y-1">
                  <p><span className="text-gray-500">Tenant:</span> <strong>{company?.name}</strong></p>
                  <p><span className="text-gray-500">Backup:</span> {format(new Date(restoreTarget.createdAt), 'MMM dd, yyyy HH:mm')} ({restoreTarget.scope})</p>
                  <p><span className="text-gray-500">Size:</span> {formatBytes(restoreTarget.sizeBytes)}</p>
                  <p><span className="text-gray-500">Checksum:</span> <code className="text-[10px]">{restoreTarget.checksumSha256}</code></p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restore-confirm">
                    Type <strong className="font-mono">{company?.name}</strong> to confirm
                  </Label>
                  <Input
                    id="restore-confirm"
                    value={restoreConfirm}
                    onChange={e => setRestoreConfirm(e.target.value)}
                    placeholder={company?.name}
                    autoComplete="off"
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreTarget(null); setRestoreConfirm(''); }}>Cancel</Button>
            <Button
              onClick={handleRestore}
              className="bg-red-600 hover:bg-red-700"
              disabled={!restoreTarget || restoreConfirm.trim() !== companyById.get(restoreTarget.tenantId)?.name}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Format an ETA timestamp as "X min remaining" / "X sec remaining".
 * Returns "almost done" when within 5 seconds (avoids "0 min remaining"
 * flicker right before status flips to completed).
 */
function formatRemaining(eta: string): string {
  const ms = new Date(eta).getTime() - Date.now();
  if (ms <= 5_000) return 'almost done';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `~${sec}s remaining`;
  const min = Math.round(sec / 60);
  if (min < 60) return `~${min} min remaining`;
  const hr = Math.round(min / 60);
  return `~${hr}h remaining`;
}

function StatusIcon({ status }: { status: BackupStatus }) {
  if (status === 'completed') return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === 'in_progress') return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function TypeBadge({ type }: { type: BackupType }) {
  const map: Record<BackupType, string> = {
    'on-demand':    'bg-blue-100 text-blue-800',
    'scheduled':    'bg-gray-100 text-gray-800',
    'pre-restore':  'bg-amber-100 text-amber-900',
    'pre-migration':'bg-purple-100 text-purple-900',
  };
  return <Badge className={`${map[type]} text-[10px] capitalize`}>{type.replace('-', ' ')}</Badge>;
}

const TONE: Record<string, string> = {
  gray:  'text-gray-700',
  blue:  'text-blue-700',
  amber: 'text-amber-700',
  red:   'text-red-700',
};
function StatCard({ label, value, Icon, tone, spin }: {
  label: string; value: string | number; Icon: any; tone: keyof typeof TONE; spin?: boolean;
}) {
  return (
    <Card className="border-gray-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-5 w-5 ${TONE[tone]} ${spin ? 'animate-spin' : ''}`} />
          <span className={`text-2xl font-bold ${TONE[tone]}`}>{value}</span>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
      </CardContent>
    </Card>
  );
}
