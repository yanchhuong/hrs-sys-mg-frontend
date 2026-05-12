import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Link2, Copy, RefreshCw, Trash2, CheckCircle, AlertTriangle, XCircle, Clock, Plus, Shield,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { mockLocalInstalls, mockCompanies, SyncHealth } from '../../../data/platformData';
import { API_BASE, USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';

/**
 * Public URL an external Device Integration System would target. Mirrors the
 * `buildUrl` logic in `api/client.ts`: when the API base ends in `/api` or
 * `/api-XX`, the call-site `/api/v1/...` path gets its leading `/api`
 * stripped (the nginx proxy already maps `/api-02/v1/...` → upstream
 * `/api/v1/...`). For local dev (`http://localhost:4000`), the path stays
 * intact. Relative bases (e.g. `/api-02` on Vercel) get the current origin
 * prefixed so the URL is copy-paste-ready for an integrator on a different
 * host.
 */
function publicEndpoint(path: string): { base: string; url: string } {
  const raw = API_BASE.replace(/\/$/, '');
  const abs = /^https?:\/\//i.test(raw)
    ? raw
    : (typeof window !== 'undefined' ? window.location.origin + raw : raw);
  const endsInApi = /\/api(-[\w-]+)?$/.test(abs);
  const tail = endsInApi && path.startsWith('/api/') ? path.slice('/api'.length) : path;
  return { base: abs, url: `${abs}${tail}` };
}

// Live LocalInstall lacks the cleartext apiKey and uses tenantId in place of
// companyId; mocks use the legacy shape. We coerce mocks into the live shape
// once at load time so the rest of the component reads a single type.
function mockToLive(): platformApi.LocalInstall[] {
  return mockLocalInstalls.map(m => ({
    id: m.id,
    tenantId: m.companyId,
    siteName: m.siteName,
    apiKeyLastFour: m.apiKeyLastFour,
    agentVersion: m.agentVersion,
    createdAt: m.createdAt,
    lastSyncAt: m.lastSyncAt ?? null,
    lastSyncStatus: m.lastSyncStatus ?? 'never',
    lastSyncError: m.lastSyncError ?? null,
    syncHealth: m.syncHealth,
    revokedAt: null,
    allowedIps: null,
    lastIpAddress: null,
  }));
}

function mockTenants(): platformApi.PlatformTenant[] {
  return mockCompanies.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    planTier: c.planTier,
    status: c.status,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone ?? '',
    country: c.country,
    notes: c.notes ?? '',
    suspendedAt: null,
    cancelledAt: null,
    createdAt: c.createdAt,
    updatedAt: c.lastActiveAt,
  }));
}

function randomMockKey(): string {
  const bytes = new Uint8Array(32);
  (typeof crypto !== 'undefined'
    ? crypto
    : ({ getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } } as Crypto)
  ).getRandomValues(bytes);
  return 'pk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function SyncMonitor() {
  const [installs, setInstalls] = useState<platformApi.LocalInstall[]>([]);
  const [tenants, setTenants] = useState<platformApi.PlatformTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ install: platformApi.LocalInstall; key: string } | null>(null);
  const [rotateTarget, setRotateTarget] = useState<platformApi.LocalInstall | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<platformApi.LocalInstall | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newInstall, setNewInstall] = useState({ tenantId: '', siteName: '', allowedIps: '' });
  const [ipsTarget, setIpsTarget] = useState<platformApi.LocalInstall | null>(null);
  const [ipsDraft, setIpsDraft] = useState('');
  const [ipsSaving, setIpsSaving] = useState(false);

  const tenantById = useMemo(() => new Map(tenants.map(t => [t.id, t])), [tenants]);

  const summary = useMemo(() => ({
    total:    installs.length,
    healthy:  installs.filter(i => i.syncHealth === 'healthy').length,
    degraded: installs.filter(i => i.syncHealth === 'degraded').length,
    down:     installs.filter(i => i.syncHealth === 'down').length,
    never:    installs.filter(i => i.syncHealth === 'never').length,
  }), [installs]);

  const loadData = async () => {
    if (USE_MOCKS) {
      // Mock fallback — coerce legacy arrays into live shape for type parity.
      setInstalls(mockToLive());
      setTenants(mockTenants());
      return;
    }
    setLoading(true);
    try {
      const [i, t] = await Promise.all([
        platformApi.installs.list(),
        platformApi.tenants.list(),
      ]);
      setInstalls(i);
      setTenants(t);
    } catch {
      // Leave whatever was last loaded; toasts at the call site explain failure.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The cleartext API key is only available at issuance (create/rotate). After
  // that the row only carries the last-four. Surfacing the inline copy button
  // tells the admin to rotate if they need a key they can deliver.
  const handleCopyKey = (install: platformApi.LocalInstall) => {
    toast.info(`Key for ${install.siteName} ends in ${install.apiKeyLastFour}. Rotate to issue a new copyable key.`);
  };

  const handleRotate = async () => {
    if (!rotateTarget) return;
    if (USE_MOCKS) {
      const fresh = randomMockKey();
      setInstalls(prev => prev.map(i =>
        i.id === rotateTarget.id
          ? {
              ...i,
              apiKeyLastFour: fresh.slice(-4),
              lastSyncAt: null,
              syncHealth: 'never',
              lastSyncStatus: 'never',
              lastSyncError: null,
            }
          : i
      ));
      setRevealedKey({ install: { ...rotateTarget, apiKeyLastFour: fresh.slice(-4) }, key: fresh });
      toast.success(`Rotated API key for ${rotateTarget.siteName}. The previous key is now invalid.`);
      setRotateTarget(null);
      return;
    }
    try {
      const { install, apiKey, warning } = await platformApi.installs.rotateKey(rotateTarget.id);
      setInstalls(prev => prev.map(i => (i.id === install.id ? install : i)));
      setRevealedKey({ install, key: apiKey });
      toast.success(warning || `Rotated API key for ${install.siteName}. The previous key is now invalid.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rotate key');
    } finally {
      setRotateTarget(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    if (USE_MOCKS) {
      setInstalls(prev => prev.filter(i => i.id !== revokeTarget.id));
      toast.success(`Revoked ${revokeTarget.siteName}`);
      setRevokeTarget(null);
      return;
    }
    try {
      await platformApi.installs.revoke(revokeTarget.id);
      toast.success(`Revoked ${revokeTarget.siteName}`);
      setRevokeTarget(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke');
      setRevokeTarget(null);
    }
  };

  const handleSaveIps = async () => {
    if (!ipsTarget) return;
    const trimmed = ipsDraft.trim();
    if (USE_MOCKS) {
      setInstalls(prev => prev.map(i =>
        i.id === ipsTarget.id ? { ...i, allowedIps: trimmed === '' ? null : trimmed } : i
      ));
      toast.success(trimmed === '' ? 'Cleared IP allowlist' : `Updated allowlist for ${ipsTarget.siteName}`);
      setIpsTarget(null);
      return;
    }
    setIpsSaving(true);
    try {
      const updated = await platformApi.installs.update(ipsTarget.id, { allowedIps: trimmed });
      setInstalls(prev => prev.map(i => (i.id === updated.id ? updated : i)));
      toast.success(trimmed === '' ? 'Cleared IP allowlist' : `Updated allowlist for ${updated.siteName}`);
      setIpsTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save allowlist');
    } finally {
      setIpsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newInstall.tenantId || !newInstall.siteName.trim()) {
      toast.error('Pick a tenant and give the site a name');
      return;
    }
    const allowed = newInstall.allowedIps.trim();
    if (USE_MOCKS) {
      const fresh = randomMockKey();
      const now = new Date().toISOString();
      const record: platformApi.LocalInstall = {
        id: `L${String(installs.length + 100).padStart(3, '0')}`,
        tenantId: newInstall.tenantId,
        siteName: newInstall.siteName.trim(),
        apiKeyLastFour: fresh.slice(-4),
        createdAt: now,
        syncHealth: 'never',
        lastSyncStatus: 'never',
        lastSyncAt: null,
        lastSyncError: null,
        agentVersion: '1.4.2',
        revokedAt: null,
        allowedIps: allowed === '' ? null : allowed,
        lastIpAddress: null,
      };
      setInstalls(prev => [...prev, record]);
      setRevealedKey({ install: record, key: fresh });
      setNewInstall({ tenantId: '', siteName: '', allowedIps: '' });
      setCreateDialogOpen(false);
      toast.success(`Issued key for ${record.siteName}`);
      return;
    }
    try {
      const { install, apiKey, warning } = await platformApi.installs.create({
        tenantId: newInstall.tenantId,
        siteName: newInstall.siteName.trim(),
        allowedIps: allowed,
      });
      setInstalls(prev => [...prev, install]);
      setRevealedKey({ install, key: apiKey });
      setNewInstall({ tenantId: '', siteName: '', allowedIps: '' });
      setCreateDialogOpen(false);
      toast.success(warning || `Issued key for ${install.siteName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to issue key');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <HealthStat label="Total" value={summary.total} Icon={Link2} tone="gray" />
        <HealthStat label="Healthy" value={summary.healthy} Icon={CheckCircle} tone="green" />
        <HealthStat label="Degraded" value={summary.degraded} Icon={AlertTriangle} tone="amber" />
        <HealthStat label="Down" value={summary.down} Icon={XCircle} tone="red" />
        <HealthStat label="Never synced" value={summary.never} Icon={Clock} tone="blue" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Local Installations</CardTitle>
              <CardDescription>Each row is a site paired to a tenant via an API key.</CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Issue New Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Allowed IPs</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-400 py-10">
                    {loading ? 'Loading…' : 'No local installations issued yet.'}
                  </TableCell>
                </TableRow>
              )}
              {installs.map(inst => {
                const tenant = tenantById.get(inst.tenantId);
                return (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{inst.siteName}</p>
                      <p className="text-xs font-mono text-gray-500" title="Last source IP that authenticated with this key">
                        {inst.lastIpAddress ?? <span className="text-gray-300">—</span>}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{tenant?.name ?? '—'}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        pk_•••••••• {inst.apiKeyLastFour}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs">
                      {inst.allowedIps && inst.allowedIps.trim()
                        ? <span className="font-mono text-gray-700" title={inst.allowedIps}>
                            {truncateIps(inst.allowedIps)}
                          </span>
                        : <span className="text-gray-400">Any IP</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">v{inst.agentVersion ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {inst.lastSyncAt ? (
                        <>
                          <p>{formatDistanceToNow(new Date(inst.lastSyncAt), { addSuffix: true })}</p>
                          {inst.lastSyncStatus === 'error' && inst.lastSyncError && (
                            <p className="text-xs text-red-700 truncate" title={inst.lastSyncError}>{inst.lastSyncError}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell><HealthBadge health={inst.syncHealth as SyncHealth} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => handleCopyKey(inst)}
                          title="Reveal & copy key"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-50"
                          onClick={() => { setIpsDraft(inst.allowedIps ?? ''); setIpsTarget(inst); }}
                          title="Edit allowed IPs"
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50"
                          onClick={() => setRotateTarget(inst)}
                          title="Rotate key"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => setRevokeTarget(inst)}
                          title="Revoke"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Issue new key */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue new local install key</DialogTitle>
            <DialogDescription>
              Generate a tenant-scoped API key for a new on-premise installation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Company</label>
              <select
                value={newInstall.tenantId}
                onChange={(e) => setNewInstall({ ...newInstall, tenantId: e.target.value })}
                className="w-full h-9 px-3 border rounded-md text-sm"
              >
                <option value="">Select a tenant…</option>
                {tenants.filter(t => t.status !== 'cancelled').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Site name</label>
              <input
                type="text"
                value={newInstall.siteName}
                onChange={(e) => setNewInstall({ ...newInstall, siteName: e.target.value })}
                placeholder="e.g. ACME Siem Reap"
                className="w-full h-9 px-3 border rounded-md text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-700" />
                Allowed IPs <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={newInstall.allowedIps}
                onChange={(e) => setNewInstall({ ...newInstall, allowedIps: e.target.value })}
                placeholder="e.g. 203.0.113.12, 198.51.100.0/24"
                rows={2}
                className="w-full px-3 py-2 border rounded-md text-sm font-mono"
              />
              <p className="text-xs text-gray-500">
                Comma-separated source IPs / CIDR ranges. Leave empty to allow any IP. Localhost is always permitted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setNewInstall({ tenantId: '', siteName: '', allowedIps: '' }); }}>Cancel</Button>
            <Button onClick={handleCreate}>Generate key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal key */}
      <Dialog open={!!revealedKey} onOpenChange={(o) => !o && setRevealedKey(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>API key for {revealedKey?.install.siteName}</DialogTitle>
            <DialogDescription>
              Send this to the site admin or Device Integration vendor securely.
              The full key is never shown again — rotate to issue a new one.
            </DialogDescription>
          </DialogHeader>
          {revealedKey && (() => {
            const key = revealedKey.key;
            const tenant = tenantById.get(revealedKey.install.tenantId);
            const ping  = publicEndpoint('/api/v1/integration/attendance/ping');
            const scans = publicEndpoint('/api/v1/integration/attendance/scans');
            const jsonConfig = JSON.stringify({
              baseUrl:  ping.base,
              apiKey:   key,
              tenant:   { slug: tenant?.slug ?? null, name: tenant?.name ?? null },
              endpoints: {
                ping:  ping.url.slice(ping.base.length),
                scans: scans.url.slice(scans.base.length),
              },
              scanPayloadExample: [
                { empNo: 'EMP001', scanAt: new Date().toISOString(), deviceCode: 'gate-1' },
              ],
            }, null, 2);
            const curlPing = `curl -H "X-API-Key: ${key}" \\\n  ${ping.url}`;
            const curlScans = `curl -X POST ${scans.url} \\\n  -H "X-API-Key: ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '[{"empNo":"EMP001","scanAt":"${new Date().toISOString()}","deviceCode":"gate-1"}]'`;
            const copy = (text: string, label: string) => {
              navigator.clipboard.writeText(text).catch(() => {});
              toast.success(`${label} copied`);
            };
            return (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-700">API key</p>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(key, 'Key')}>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                  </div>
                  <div className="font-mono text-xs bg-gray-900 text-gray-100 px-3 py-2.5 rounded-md break-all select-all">
                    {key}
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
                  <p>
                    Full write access to <strong>{tenant?.name ?? 'the tenant'}</strong>'s data.
                    Authorises both cloud sync and the Device Integration endpoints.
                    Rotate immediately if it leaks.
                  </p>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Device Integration config
                  </p>
                  <p className="text-xs text-gray-500 -mt-1">
                    Paste this into the integrator's config or use the curl snippets to wire up
                    a third-party scanner. Endpoints accept attendance scans by empNo so the
                    integrator never needs to know internal UUIDs.
                  </p>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-gray-700">Integration config (JSON)</p>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(jsonConfig, 'JSON config')}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <pre className="font-mono text-[11px] bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-md overflow-x-auto whitespace-pre">
{jsonConfig}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-gray-700">Verify the key (ping)</p>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(curlPing, 'Ping curl')}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <pre className="font-mono text-[11px] bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-md overflow-x-auto whitespace-pre">
{curlPing}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-gray-700">Push a scan</p>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(curlScans, 'Push curl')}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <pre className="font-mono text-[11px] bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-md overflow-x-auto whitespace-pre">
{curlScans}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit IP allowlist */}
      <Dialog open={!!ipsTarget} onOpenChange={(o) => { if (!o) setIpsTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allowed IPs for {ipsTarget?.siteName}</DialogTitle>
            <DialogDescription>
              Comma-separated allowlist of source IPs / CIDR ranges. Leave empty to allow any IP. Examples: <code>203.0.113.12</code>, <code>203.0.113.0/24</code>.
              <br />
              <span className="text-xs text-gray-500">Localhost is always permitted so admins can't lock themselves out of local testing.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={ipsDraft}
              onChange={(e) => setIpsDraft(e.target.value)}
              placeholder="e.g. 203.0.113.12, 198.51.100.0/24"
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm font-mono"
            />
            {!ipsDraft.trim() && (
              <p className="text-xs text-amber-700">No restriction — the API key will be accepted from any IP.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIpsTarget(null)} disabled={ipsSaving}>Cancel</Button>
            <Button onClick={handleSaveIps} disabled={ipsSaving}>
              {ipsSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate confirmation */}
      <AlertDialog open={!!rotateTarget} onOpenChange={(o) => !o && setRotateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API key for {rotateTarget?.siteName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The current key stops working immediately. The site cannot sync until you deliver the new key and reconfigure its install.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate}>Rotate key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.siteName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the local install's record and its API key. Data already synced to the cloud is kept. To restore, issue a new key and reconfigure the site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-red-600 hover:bg-red-700">Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const HEALTH_MAP: Record<SyncHealth, { label: string; cls: string; Icon: typeof CheckCircle }> = {
  healthy:  { label: 'Healthy',  cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
  degraded: { label: 'Degraded', cls: 'bg-amber-100 text-amber-900', Icon: AlertTriangle },
  down:     { label: 'Down',     cls: 'bg-red-100 text-red-800',     Icon: XCircle },
  never:    { label: 'Never',    cls: 'bg-blue-100 text-blue-800',   Icon: Clock },
};

/** Show first IP/CIDR + a "+N" suffix when the allowlist is long, so the
 *  table cell stays compact. The full value is exposed via `title=` on hover. */
function truncateIps(s: string): string {
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return s;
  const first = parts[0];
  return parts.length > 1 ? `${first} +${parts.length - 1}` : first;
}

function HealthBadge({ health }: { health: SyncHealth }) {
  const entry = HEALTH_MAP[health] ?? HEALTH_MAP.never;
  const { label, cls, Icon } = entry;
  return (
    <Badge className={`${cls} gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

const TONE: Record<string, string> = {
  gray:  'text-gray-700',
  green: 'text-green-700',
  amber: 'text-amber-700',
  red:   'text-red-700',
  blue:  'text-blue-700',
};
function HealthStat({ label, value, Icon, tone }: { label: string; value: number; Icon: any; tone: keyof typeof TONE }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${TONE[tone]}`}>{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
        <Icon className={`h-5 w-5 ${TONE[tone]}`} />
      </CardContent>
    </Card>
  );
}
