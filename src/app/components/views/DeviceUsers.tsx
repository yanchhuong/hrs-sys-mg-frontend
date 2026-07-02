import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Switch } from '../ui/switch';
import { SearchablePicker } from '../common/SearchablePicker';
import * as unmatchedApi from '../../api/unmatchedDeviceUsers';
import * as employeesApi from '../../api/employees';
import { Employee } from '../../types/hrms';
import { USE_MOCKS } from '../../api/client';
import {
  Search, MoreHorizontal, Link2, EyeOff, Trash2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { format } from 'date-fns';

interface Props {
  /** When true, skip the page-level title (renders inside a tab). */
  embedded?: boolean;
}

/**
 * Admin tool: list device user-ids the sync worker pushed but couldn't
 * match to any Employee.empNo. Lets the admin either bind a device id to
 * an existing employee (renames the employee's empNo to the device id)
 * or dismiss the row.
 */
export function DeviceUsers({ embedded = false }: Props = {}) {
  const [rows, setRows] = useState<unmatchedApi.UnmatchedDeviceUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);

  const [bindDialog, setBindDialog] = useState<unmatchedApi.UnmatchedDeviceUser | null>(null);
  const [bindEmployeeId, setBindEmployeeId] = useState('');
  const [binding, setBinding] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<unmatchedApi.UnmatchedDeviceUser | null>(null);

  const refresh = async () => {
    if (USE_MOCKS) return;
    setLoading(true);
    try {
      const list = await unmatchedApi.list(showDismissed);
      setRows(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load device users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (USE_MOCKS) return;
    void refresh();
    (async () => {
      try {
        const res = await employeesApi.list({ size: 500 });
        setEmployees(res.content.map(e => ({
          id: e.empNo,
          apiId: e.id,
          name: e.name,
          email: e.email,
          position: e.position,
          department: e.departmentId ?? '-',
          joinDate: e.joinDate,
          status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
          contactNumber: e.contactNumber ?? '',
          baseSalary: e.baseSalary,
        })));
      } catch (err) {
        console.warn('Failed to load employees for binding picker', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDismissed]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.deviceUserId.toLowerCase().includes(q));
  }, [rows, search]);

  const openBind = (row: unmatchedApi.UnmatchedDeviceUser) => {
    setBindDialog(row);
    setBindEmployeeId('');
  };

  const confirmBind = async () => {
    if (!bindDialog) return;
    if (!bindEmployeeId) {
      notify.validate('Pick an employee to bind this device id to');
      return;
    }
    setBinding(true);
    try {
      const res = await unmatchedApi.bind(bindDialog.id, bindEmployeeId);
      notify.success(`Bound ${res.deviceUserId} → ${res.boundEmployeeName ?? 'employee'} (empNo ${res.boundEmpNo})`);
      setBindDialog(null);
      await refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Bind failed');
    } finally {
      setBinding(false);
    }
  };

  const handleDismiss = async (row: unmatchedApi.UnmatchedDeviceUser) => {
    try {
      await unmatchedApi.dismiss(row.id);
      notify.success(`Dismissed ${row.deviceUserId}`);
      await refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Dismiss failed');
    }
  };

  const handleRemove = async (row: unmatchedApi.UnmatchedDeviceUser) => {
    try {
      await unmatchedApi.remove(row.id);
      notify.success(`Removed ${row.deviceUserId}`);
      setConfirmRemove(null);
      await refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Remove failed');
    }
  };

  const fmtDate = (s?: string | null) => s ? format(new Date(s), 'MMM dd, yyyy HH:mm') : '—';

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold">Device Users</h1>
        </div>
      )}

      {/* Help banner — explains the "what" so admins know why these rows exist. */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Why these appear</p>
              <p className="text-xs text-blue-700">
                Each row is a device user-id the sync worker tried to import but couldn't match
                against any employee's <code className="bg-white/60 px-1 rounded">empNo</code>.
                Bind it to an existing employee (renames their empNo to the device id) or dismiss
                the row if it's a visitor / decommissioned slot.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Unmatched Device Users</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} of ${rows.length}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={showDismissed} onCheckedChange={setShowDismissed} />
                <Label className="text-sm cursor-pointer" onClick={() => setShowDismissed(!showDismissed)}>
                  Show dismissed
                </Label>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search device id…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 w-56"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device User ID</TableHead>
                <TableHead className="text-center">Occurrences</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Last Punch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                    {loading ? 'Loading…' : (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-green-400" />
                        <p className="text-sm">All device user-ids are matched. Nothing to resolve.</p>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : filtered.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium tabular-nums text-sm">{row.deviceUserId}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{row.occurrenceCount}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">{fmtDate(row.firstSeenAt)}</TableCell>
                  <TableCell className="text-xs text-gray-600">{fmtDate(row.lastSeenAt)}</TableCell>
                  <TableCell className="text-xs text-gray-600">{fmtDate(row.lastRecordTime)}</TableCell>
                  <TableCell>
                    {row.dismissedAt
                      ? <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">Dismissed</Badge>
                      : <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Unmatched</Badge>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!row.dismissedAt && (
                          <>
                            <DropdownMenuItem onClick={() => openBind(row)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Bind to employee…
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDismiss(row)}>
                              <EyeOff className="mr-2 h-4 w-4" />
                              Dismiss
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem className="text-red-600" onClick={() => setConfirmRemove(row)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bind dialog */}
      <Dialog open={!!bindDialog} onOpenChange={(open) => !open && setBindDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bind device user</DialogTitle>
            <DialogDescription>
              Pick an existing employee. Their <code className="bg-gray-100 px-1 rounded">empNo</code> will
              be renamed to <strong className="tabular-nums">{bindDialog?.deviceUserId}</strong> so future
              punches from the device resolve to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Employee</Label>
            <SearchablePicker
              options={employees
                .filter(e => e.status === 'active')
                .map(e => ({
                  value: (e as any).apiId ?? e.id,
                  label: e.name,
                  secondary: `${e.id} · ${e.position ?? ''}`,
                  searchKey: `${e.name} ${e.id} ${e.position ?? ''}`,
                }))}
              value={bindEmployeeId}
              onChange={setBindEmployeeId}
              placeholder="Choose employee…"
              searchPlaceholder="Search by name, ID, position…"
              allowClear={false}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindDialog(null)} disabled={binding}>Cancel</Button>
            <Button onClick={confirmBind} disabled={binding}>
              {binding ? 'Binding…' : 'Bind'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete unmatched record?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && (
                <>
                  This permanently removes <span className="tabular-nums font-semibold">{confirmRemove.deviceUserId}</span> from
                  the tracking list. If the device is still pushing this id, it will reappear on the next sync.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
