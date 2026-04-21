import { useMemo, useState } from 'react';
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
  Link2, Copy, RefreshCw, Trash2, CheckCircle, AlertTriangle, XCircle, Clock, Plus, Eye, EyeOff,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  mockLocalInstalls, mockCompanies, LocalInstall, SyncHealth,
} from '../../../data/platformData';

function randomKey(): string {
  const bytes = new Uint8Array(32);
  (typeof crypto !== 'undefined' ? crypto : ({ getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } } as Crypto)).getRandomValues(bytes);
  return 'pk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function SyncMonitor() {
  const [installs, setInstalls] = useState<LocalInstall[]>(mockLocalInstalls);
  const [revealedKey, setRevealedKey] = useState<{ install: LocalInstall; key: string } | null>(null);
  const [rotateTarget, setRotateTarget] = useState<LocalInstall | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<LocalInstall | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newInstall, setNewInstall] = useState({ companyId: '', siteName: '' });

  const companyById = useMemo(() => new Map(mockCompanies.map(c => [c.id, c])), []);

  const summary = useMemo(() => ({
    total:    installs.length,
    healthy:  installs.filter(i => i.syncHealth === 'healthy').length,
    degraded: installs.filter(i => i.syncHealth === 'degraded').length,
    down:     installs.filter(i => i.syncHealth === 'down').length,
    never:    installs.filter(i => i.syncHealth === 'never').length,
  }), [installs]);

  const handleCopyKey = (install: LocalInstall) => {
    navigator.clipboard.writeText(install.apiKey).catch(() => {});
    setRevealedKey({ install, key: install.apiKey });
    toast.success('API key copied to clipboard');
  };

  const handleRotate = () => {
    if (!rotateTarget) return;
    const fresh = randomKey();
    setInstalls(prev => prev.map(i =>
      i.id === rotateTarget.id
        ? { ...i, apiKey: fresh, apiKeyLastFour: fresh.slice(-4), lastSyncAt: undefined, syncHealth: 'never', lastSyncStatus: undefined, lastSyncError: undefined }
        : i
    ));
    toast.success(`Rotated API key for ${rotateTarget.siteName}. Deliver the new key to the site.`);
    setRevealedKey({ install: { ...rotateTarget, apiKey: fresh }, key: fresh });
    setRotateTarget(null);
  };

  const handleRevoke = () => {
    if (!revokeTarget) return;
    setInstalls(prev => prev.filter(i => i.id !== revokeTarget.id));
    toast.success(`Revoked ${revokeTarget.siteName}`);
    setRevokeTarget(null);
  };

  const handleCreate = () => {
    if (!newInstall.companyId || !newInstall.siteName.trim()) {
      toast.error('Pick a company and give the site a name');
      return;
    }
    const fresh = randomKey();
    const now = new Date().toISOString();
    const record: LocalInstall = {
      id: `L${String(installs.length + 100).padStart(3, '0')}`,
      companyId: newInstall.companyId,
      siteName: newInstall.siteName.trim(),
      apiKey: fresh,
      apiKeyLastFour: fresh.slice(-4),
      createdAt: now,
      syncHealth: 'never',
      agentVersion: '1.4.2',
    };
    setInstalls(prev => [...prev, record]);
    setRevealedKey({ install: record, key: fresh });
    setNewInstall({ companyId: '', siteName: '' });
    setCreateDialogOpen(false);
    toast.success(`Issued key for ${record.siteName}`);
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
            <Button onClick={() => setCreateDialogOpen(true)}>
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
                <TableHead>Agent</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                    No local installations issued yet.
                  </TableCell>
                </TableRow>
              )}
              {installs.map(inst => {
                const company = companyById.get(inst.companyId);
                return (
                  <TableRow key={inst.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{inst.siteName}</p>
                      <p className="text-xs text-gray-400">{inst.ipAddress ?? '—'}</p>
                    </TableCell>
                    <TableCell className="text-sm">{company?.name ?? '—'}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        pk_•••••••• {inst.apiKeyLastFour}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">v{inst.agentVersion}</TableCell>
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
                    <TableCell><HealthBadge health={inst.syncHealth} /></TableCell>
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
                value={newInstall.companyId}
                onChange={(e) => setNewInstall({ ...newInstall, companyId: e.target.value })}
                className="w-full h-9 px-3 border rounded-md text-sm"
              >
                <option value="">Select a tenant…</option>
                {mockCompanies.filter(c => c.status !== 'cancelled').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Generate key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal key */}
      <Dialog open={!!revealedKey} onOpenChange={(o) => !o && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key for {revealedKey?.install.siteName}</DialogTitle>
            <DialogDescription>
              Send this to the site admin securely. It will not be shown in full again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="font-mono text-xs bg-gray-900 text-gray-100 px-3 py-3 rounded-md break-all select-all">
              {revealedKey?.key}
            </div>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
              <p>This key grants full write access to {companyById.get(revealedKey?.install.companyId ?? '')?.name ?? 'the tenant'}'s data. Rotate immediately if it leaks.</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(revealedKey?.key ?? '').catch(() => {}); toast.success('Copied'); }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
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

function HealthBadge({ health }: { health: SyncHealth }) {
  const { label, cls, Icon } = HEALTH_MAP[health];
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
