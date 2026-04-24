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
import { Fingerprint, Plus, Pencil, Trash2, Wifi, WifiOff, HelpCircle, Zap, Download } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  listDevices, createDevice, updateDevice, deleteDevice, recordTestResult,
  recordSyncSuccess, recordSyncFailure,
  testDeviceReachable, Device, DeviceInput, DeviceStatus, CommType, COMM_TYPES,
} from '../../utils/devices';
import { importFingerprint } from '../../utils/apiClient';

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

function statusBadge(status: DeviceStatus) {
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

export function DevicesCard() {
  const [devices, setDevices] = useState<Device[]>(() => listDevices());
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  const refresh = () => setDevices(listDevices());

  const openCreate = () => {
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (d: Device) => {
    setForm({
      id: d.id,
      name: d.name,
      ip: d.ip,
      port: String(d.port),
      commKey: d.commKey != null ? String(d.commKey) : '',
      location: d.location ?? '',
      commType: d.commType,
      machineNo: String(d.machineNo),
      baudRate: d.baudRate != null ? String(d.baudRate) : '115200',
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
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
    const input: DeviceInput = {
      name: form.name,
      ip: form.ip,
      port,
      commKey: form.commKey.trim() ? Number(form.commKey) : undefined,
      location: form.location,
      commType: form.commType,
      machineNo,
      baudRate: isSerial && form.baudRate.trim() ? Number(form.baudRate) : undefined,
    };
    if (form.id) {
      updateDevice(form.id, input);
      toast.success(`Updated "${form.name}"`);
    } else {
      createDevice(input);
      toast.success(`Added "${form.name}"`);
    }
    setDialogOpen(false);
    refresh();
  };

  const handleTest = async (d: Device) => {
    setTestingIds(prev => new Set(prev).add(d.id));
    try {
      const ok = await testDeviceReachable(d.ip, d.port);
      recordTestResult(d.id, ok ? 'connected' : 'disconnected');
      toast[ok ? 'success' : 'error'](
        ok ? `${d.name} responded at ${d.ip}:${d.port}` : `Cannot reach ${d.ip}:${d.port}`,
      );
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev);
        next.delete(d.id);
        return next;
      });
      refresh();
    }
  };

  const handleSync = async (d: Device) => {
    setSyncingIds(prev => new Set(prev).add(d.id));
    try {
      const result = await importFingerprint({
        ip: d.ip,
        port: d.port,
        commKey: d.commKey ?? 0,
        timeoutMs: 15000,
      });
      recordSyncSuccess(d.id, result.recordCount);
      toast.success(
        `Imported ${result.recordCount} record${result.recordCount === 1 ? '' : 's'} from ${d.name}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordSyncFailure(d.id, msg);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(d.id);
        return next;
      });
      refresh();
    }
  };

  const handleTestAll = async () => {
    for (const d of devices) {
      // Sequential to avoid hammering the LAN; each call has a 3-second cap.
      // eslint-disable-next-line no-await-in-loop
      await handleTest(d);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteDevice(deleteTarget.id);
    toast.success(`Removed "${deleteTarget.name}"`);
    setDeleteTarget(null);
    refresh();
  };

  // Auto-test everything with an unknown status once per mount, so the first
  // glance at the tab shows live statuses instead of a wall of grey "Unknown".
  useEffect(() => {
    const stale = devices.filter(d => d.lastStatus === 'unknown');
    if (stale.length === 0) return;
    (async () => {
      for (const d of stale) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await testDeviceReachable(d.ip, d.port);
        recordTestResult(d.id, ok ? 'connected' : 'disconnected');
      }
      refresh();
    })();
    // Intentionally only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {devices.length === 0 ? (
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
                      {d.commKey === undefined ? <span className="text-gray-400">not set</span> : '••••'}
                    </TableCell>
                    <TableCell>{statusBadge(d.lastStatus)}</TableCell>
                    <TableCell className="text-xs">
                      {d.lastSyncAt ? (
                        <div
                          className="flex flex-col leading-tight"
                          title={
                            format(new Date(d.lastSyncAt), 'PPpp')
                            + (d.lastSyncError ? `\n\nLast error: ${d.lastSyncError}` : '')
                          }
                        >
                          <span className="text-gray-900">
                            {format(new Date(d.lastSyncAt), 'MMM dd, HH:mm')}
                          </span>
                          <span className="text-gray-500 text-[10px]">
                            {formatDistanceToNow(new Date(d.lastSyncAt), { addSuffix: true })}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{form.id ? 'Save changes' : 'Add device'}</Button>
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
    </Card>
  );
}
