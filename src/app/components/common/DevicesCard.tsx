import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Fingerprint, Plus, Pencil, Trash2, Wifi, WifiOff, HelpCircle, Zap, Download, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import * as devicesApi from '../../api/attendanceDevices';
import { importFingerprint } from '../../utils/apiClient';

const COMM_TYPES = ['Ethernet', 'RS-232', 'RS-485', 'USB'] as const;
type CommType = (typeof COMM_TYPES)[number];
type DeviceStatus = 'connected' | 'disconnected' | 'unknown';

type FormState = {
  id?: string;
  name: string;
  ip: string;
  port: string;
  commKey: string;
  location: string;
  commType: CommType;
  machineNo: string;
  baudRate: string;
};

const EMPTY: FormState = {
  name: '', ip: '', port: '4370', commKey: '', location: '',
  commType: 'Ethernet', machineNo: '1', baudRate: '115200',
};

function statusBadge(status: string) {
  if (status === 'connected') {
    return (
      <Badge className="bg-green-100 text-green-800 border-0 gap-1">
        <Wifi className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === 'disconnected') {
    return (
      <Badge className="bg-red-100 text-red-800 border-0 gap-1">
        <WifiOff className="h-3 w-3" /> Disconnected
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-700 border-0 gap-1">
      <HelpCircle className="h-3 w-3" /> Unknown
    </Badge>
  );
}

/**
 * Cross-origin TCP reachability check used by the "Test" button. The browser
 * cannot read the device's body (no CORS), but a successful no-cors fetch
 * confirms a TCP response reached us. Timeout 3 s — generous for a LAN device.
 */
async function testDeviceReachable(ip: string, port: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(`http://${ip}:${port}/`, { mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function DevicesCard() {
  const [devices, setDevices] = useState<devicesApi.AttendanceDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<devicesApi.AttendanceDevice | null>(null);
  // Per-device secret-key UI state. The secret is shown masked by
  // default; clicking the eye toggles plaintext for that one row.
  // `regenerateTarget` opens a confirm dialog before rotating the key.
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [regenerateTarget, setRegenerateTarget] = useState<devicesApi.AttendanceDevice | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const toggleReveal = (id: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copySecret = async (key: string | undefined) => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Secret key copied to clipboard');
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access');
    }
  };

  const handleRegenerate = async () => {
    if (!regenerateTarget) return;
    setRegenerating(true);
    try {
      const updated = await devicesApi.regenerateSecret(regenerateTarget.id);
      setDevices(prev => prev.map(x => x.id === updated.id ? updated : x));
      // Auto-reveal the new key so the admin can copy it immediately;
      // they're already authenticated as admin, no extra friction needed.
      setRevealedSecrets(prev => new Set(prev).add(updated.id));
      toast.success('Secret key rotated — copy and paste into the worker config');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate secret');
    } finally {
      setRegenerating(false);
      setRegenerateTarget(null);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await devicesApi.list();
      setDevices(rows);
    } catch (e) {
      toast.error(`Failed to load devices: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (d: devicesApi.AttendanceDevice) => {
    setForm({
      id: d.id,
      name: d.name,
      ip: d.ip,
      port: String(d.port),
      commKey: d.commKey != null ? String(d.commKey) : '',
      location: d.location ?? '',
      commType: (COMM_TYPES.includes(d.commType as CommType) ? d.commType : 'Ethernet') as CommType,
      machineNo: String(d.machineNo),
      baudRate: d.baudRate != null ? String(d.baudRate) : '115200',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const port = Number(form.port);
    const machineNo = Number(form.machineNo);
    if (!form.name.trim() || !form.ip.trim()) {
      toast.error('Name and IP address are required');
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error('Port must be an integer between 1 and 65535');
      return;
    }
    if (!Number.isInteger(machineNo) || machineNo < 1 || machineNo > 255) {
      toast.error('Machine No must be an integer between 1 and 255');
      return;
    }
    const isSerial = form.commType === 'RS-232' || form.commType === 'RS-485';
    const body: devicesApi.DeviceRequest = {
      name: form.name.trim(),
      ip: form.ip.trim(),
      port,
      commKey: form.commKey.trim() ? Number(form.commKey) : null,
      location: form.location.trim() || null,
      commType: form.commType,
      machineNo,
      baudRate: isSerial && form.baudRate.trim() ? Number(form.baudRate) : null,
    };
    setSubmitting(true);
    try {
      if (form.id) {
        await devicesApi.update(form.id, body);
        toast.success(`Updated "${form.name}"`);
      } else {
        await devicesApi.create(body);
        toast.success(`Added "${form.name}"`);
      }
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (d: devicesApi.AttendanceDevice) => {
    setTestingIds(prev => new Set(prev).add(d.id));
    try {
      const ok = await testDeviceReachable(d.ip, d.port);
      const status: DeviceStatus = ok ? 'connected' : 'disconnected';
      await devicesApi.update(d.id, {
        lastStatus: status,
        lastTestedAt: new Date().toISOString(),
        // On success drop any stale error; on failure leave existing for context.
        ...(ok ? { lastSyncError: '' } : {}),
      });
      toast[ok ? 'success' : 'error'](
        ok ? `${d.name} responded at ${d.ip}:${d.port}` : `Cannot reach ${d.ip}:${d.port}`,
      );
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev);
        next.delete(d.id);
        return next;
      });
      void refresh();
    }
  };

  const handleSync = async (d: devicesApi.AttendanceDevice) => {
    setSyncingIds(prev => new Set(prev).add(d.id));
    try {
      const result = await importFingerprint({
        ip: d.ip,
        port: d.port,
        commKey: d.commKey ?? 0,
        timeoutMs: 15000,
      });
      await devicesApi.update(d.id, {
        lastStatus: 'connected',
        lastSyncedAt: new Date().toISOString(),
        lastTestedAt: new Date().toISOString(),
        lastRecordCount: result.recordCount,
        lastSyncError: '',
      });
      toast.success(
        `Imported ${result.recordCount} record${result.recordCount === 1 ? '' : 's'} from ${d.name}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await devicesApi.update(d.id, {
          lastStatus: 'disconnected',
          lastTestedAt: new Date().toISOString(),
          lastSyncError: msg.slice(0, 500),
        });
      } catch { /* status update is best-effort */ }
      toast.error(`Import failed: ${msg}`);
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(d.id);
        return next;
      });
      void refresh();
    }
  };

  const handleTestAll = async () => {
    for (const d of devices) {
      // Sequential to avoid hammering the LAN; each call has a 3-second cap.
      // eslint-disable-next-line no-await-in-loop
      await handleTest(d);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await devicesApi.remove(deleteTarget.id);
      toast.success(`Removed "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-blue-600" />
            Attendance Devices
          </CardTitle>
          <CardDescription>
            Fingerprint / face terminals registered to this tenant. Connection is checked over TCP;
            ZKTeco SDK port is normally <code>4370</code>.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTestAll} disabled={devices.length === 0 || testingIds.size > 0}>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Test all
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Device
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && devices.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">Loading devices…</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">
            No devices registered yet. Click <span className="font-medium">Add Device</span> to configure one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">Machine #</TableHead>
                <TableHead>Comm Type</TableHead>
                <TableHead>IP : Port</TableHead>
                <TableHead>Comm Key</TableHead>
                <TableHead title="API key the Device Integration worker uses to authenticate sync POSTs. Survives admin password changes.">
                  Secret Key
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead>Last tested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map(d => {
                const testing = testingIds.has(d.id);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm text-gray-600">{d.location ?? '—'}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{d.machineNo}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="font-normal">
                        {d.commType}
                        {d.baudRate && d.commType !== 'Ethernet' ? ` · ${d.baudRate}` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.ip}:{d.port}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.commKey == null ? <span className="text-gray-400">not set</span> : '••••'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.secretKey ? (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-700 select-all">
                            {revealedSecrets.has(d.id)
                              ? d.secretKey
                              : `${d.secretKey.slice(0, 4)}••••••••${d.secretKey.slice(-4)}`}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 ml-0.5"
                            title={revealedSecrets.has(d.id) ? 'Hide' : 'Reveal'}
                            onClick={() => toggleReveal(d.id)}
                          >
                            {revealedSecrets.has(d.id)
                              ? <EyeOff className="h-3 w-3" />
                              : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            title="Copy to clipboard"
                            onClick={() => copySecret(d.secretKey)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-amber-600 hover:text-amber-700"
                            title="Regenerate (old key stops working immediately)"
                            onClick={() => setRegenerateTarget(d)}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(d.lastStatus)}</TableCell>
                    <TableCell className="text-xs">
                      {d.lastSyncedAt ? (
                        <div
                          className="flex flex-col leading-tight"
                          title={
                            format(new Date(d.lastSyncedAt), 'PPpp')
                            + (d.lastSyncError ? `\n\nLast error: ${d.lastSyncError}` : '')
                          }
                        >
                          <span className="text-gray-900">
                            {format(new Date(d.lastSyncedAt), 'MMM dd, HH:mm')}
                          </span>
                          <span className="text-gray-500 text-[10px]">
                            {formatDistanceToNow(new Date(d.lastSyncedAt), { addSuffix: true })}
                            {d.lastRecordCount != null && ` · ${d.lastRecordCount} rec`}
                          </span>
                        </div>
                      ) : d.lastSyncError ? (
                        <span className="text-red-600" title={d.lastSyncError}>failed</span>
                      ) : (
                        <span className="text-gray-400">never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {d.lastTestedAt ? format(new Date(d.lastTestedAt), 'MMM dd, HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={testing}
                          onClick={() => handleTest(d)}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {testing ? 'Testing…' : 'Test'}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={syncingIds.has(d.id)}
                          onClick={() => handleSync(d)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          {syncingIds.has(d.id) ? 'Syncing…' : 'Sync'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => openEdit(d)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(d)}
                          title="Delete"
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
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-blue-600" />
              {form.id ? 'Edit device' : 'Add device'}
            </DialogTitle>
            <DialogDescription>
              Set the LAN address and ZKTeco SDK port. The Comm Key is the device's
              "Communication Password" — leave blank if the device has none configured.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Display name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. We-Cafe"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Ground floor, 4th Office"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Comm Type</Label>
                <select
                  value={form.commType}
                  onChange={e => setForm({ ...form, commType: e.target.value as CommType })}
                  className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                >
                  {COMM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Machine No <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={255}
                  value={form.machineNo}
                  onChange={e => setForm({ ...form, machineNo: e.target.value })}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label>IP address <span className="text-red-500">*</span></Label>
                <Input
                  value={form.ip}
                  onChange={e => setForm({ ...form, ip: e.target.value })}
                  placeholder="192.168.178.243"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Port <span className="text-red-500">*</span></Label>
                <Input
                  value={form.port}
                  onChange={e => setForm({ ...form, port: e.target.value })}
                  className="w-24"
                  placeholder="4370"
                />
              </div>
            </div>
            {(form.commType === 'RS-232' || form.commType === 'RS-485') && (
              <div className="space-y-1.5">
                <Label>Baud rate</Label>
                <select
                  value={form.baudRate}
                  onChange={e => setForm({ ...form, baudRate: e.target.value })}
                  className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                >
                  {[9600, 19200, 38400, 57600, 115200].map(b => (
                    <option key={b} value={b}>{b.toLocaleString()}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Comm Key (Communication Password)</Label>
              <Input
                type="number"
                value={form.commKey}
                onChange={e => setForm({ ...form, commKey: e.target.value })}
                placeholder="leave blank for no key"
              />
              <p className="text-[11px] text-gray-500">
                Found under <code>Menu → Comm → Comm Key</code> on the device. 0 = no key.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : (form.id ? 'Save changes' : 'Add device')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete device?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the device entry. Already-imported attendance records are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Secret-key rotation confirmation */}
      <AlertDialog open={!!regenerateTarget} onOpenChange={(open) => !open && setRegenerateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate secret key?</AlertDialogTitle>
            <AlertDialogDescription>
              Generates a new key for <strong>{regenerateTarget?.name}</strong>. The old key
              stops working immediately — update the worker config (or any
              other consumer) with the new value or syncs from this device
              will fail until you do.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? 'Rotating…' : 'Rotate key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
