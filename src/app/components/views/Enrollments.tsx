import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
import { Plus, Pencil, Trash2, Search, Receipt, CheckCircle2, XCircle, Clock, Settings } from 'lucide-react';
import * as enrollmentsApi from '../../api/enrollments';
import * as customersApi from '../../api/customers';
import * as itemsApi from '../../api/items';
import { useAuth } from '../../context/AuthContext';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import { EnrollmentSettingsDialog } from '../common/EnrollmentSettingsDialog';

/**
 * Enrollments — School vertical page (v-school-enrollment). One row
 * per (student, class). Flow:
 *   Student → Enrollment → Assign Class → Generate Invoice → Payment
 *   → Enrollment Active
 *
 * <p>The **Generate Invoice** action mints a tuition-kind invoice
 * (Invoice.KIND_TUITION) and stamps its id onto the enrollment. The
 * FE cross-links via a small "Invoice #" badge so the operator can
 * find the payment surface.</p>
 *
 * <p>Manual status flips: {@code enrolled → active} after payment (or
 * admin fiat); {@code active → completed} when the class ends;
 * {@code * → withdrawn} for cancellation.</p>
 */
const emptyForm: enrollmentsApi.EnrollmentRequest = {
  studentId: '',
  classId: '',
  enrollmentDate: null,
  currency: 'USD',
  exchangeRate: 1,
  unitPrice: null,
  quantity: 1,
  notes: '',
};

const STATUS_BADGES: Record<enrollmentsApi.EnrollmentStatus, { label: string; cls: string; icon: JSX.Element }> = {
  enrolled:  { label: 'Enrolled',  cls: 'bg-blue-100 text-blue-700 border-blue-200',       icon: <Clock className="h-3 w-3 mr-1" /> },
  active:    { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-700 border-slate-200',    icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
  withdrawn: { label: 'Withdrawn', cls: 'bg-rose-100 text-rose-700 border-rose-200',       icon: <XCircle className="h-3 w-3 mr-1" /> },
};

export function Enrollments() {
  const { canCreate, canUpdate, canDelete, canView } = useAuth();
  const canAdd = canCreate('enrollment');
  const canEdit = canUpdate('enrollment');
  const canRemove = canDelete('enrollment');
  const canBill = canUpdate('enrollment') && canCreate('invoice');

  const [rows, setRows] = useState<enrollmentsApi.Enrollment[]>([]);
  const [students, setStudents] = useState<customersApi.Customer[]>([]);
  const [classes, setClasses] = useState<itemsApi.Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | enrollmentsApi.EnrollmentStatus>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<enrollmentsApi.Enrollment | null>(null);
  const [form, setForm] = useState<enrollmentsApi.EnrollmentRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<enrollmentsApi.Enrollment | null>(null);
  // v-enrollment-settings-courses — settings popup holds the Course
  // and Class catalog editors so the setup flow lives one click
  // away from the enrollment register that uses them.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const page = await enrollmentsApi.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        size: 200,
      });
      setRows(page.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  useEffect(() => {
    // Students + Classes pickers — cached once per page mount.
    (async () => {
      try {
        const [s, c] = await Promise.all([
          canView('enrollment') ? customersApi.list({ kind: 'student', size: 500 }) : Promise.resolve({ content: [] }),
          canView('enrollment') ? itemsApi.list({ type: 'class', size: 500 }) : Promise.resolve({ content: [] }),
        ]);
        setStudents(s.content ?? []);
        setClasses(c.content ?? []);
      } catch { /* soft-fail — pickers show empty */ }
    })();
  }, [canView]);

  const studentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.name);
    return (id: string) => map.get(id) ?? '—';
  }, [students]);

  const classInfo = useMemo(() => {
    const map = new Map<string, itemsApi.Item>();
    for (const c of classes) map.set(c.id, c);
    return (id: string) => map.get(id);
  }, [classes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      r.enrollmentNo.toLowerCase().includes(needle)
      || studentName(r.studentId).toLowerCase().includes(needle)
      || (classInfo(r.classId)?.name ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q, studentName, classInfo]);

  const pagination = usePagination(filtered);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (e: enrollmentsApi.Enrollment) => {
    setEditing(e);
    setForm({
      enrollmentNo: e.enrollmentNo,
      studentId: e.studentId,
      classId: e.classId,
      enrollmentDate: e.enrollmentDate ?? null,
      currency: e.currency,
      exchangeRate: e.exchangeRate,
      unitPrice: e.unitPrice,
      quantity: e.quantity,
      notes: e.notes ?? '',
    });
    setDialogOpen(true);
  };

  // Auto-fill unit price from the picked class when the user hasn't
  // manually overridden. Only fires on class change and only when the
  // field is empty / matches the previous class's default.
  const onClassChange = (classId: string) => {
    setForm(f => {
      const next = { ...f, classId };
      const picked = classInfo(classId);
      const prevPickedPrice = classInfo(f.classId)?.unitPrice;
      const priceUnchanged = f.unitPrice == null || f.unitPrice === prevPickedPrice;
      if (picked && priceUnchanged) next.unitPrice = picked.unitPrice ?? 0;
      return next;
    });
  };

  const submit = async () => {
    if (!form.studentId) { toast.error('Pick a student'); return; }
    if (!form.classId)   { toast.error('Pick a class'); return; }
    setSaving(true);
    try {
      if (editing) {
        await enrollmentsApi.update(editing.id, form);
        toast.success('Enrollment updated');
      } else {
        await enrollmentsApi.create(form);
        toast.success('Enrollment created');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save enrollment');
    } finally {
      setSaving(false);
    }
  };

  const doGenerateInvoice = async (r: enrollmentsApi.Enrollment) => {
    try {
      const inv = await enrollmentsApi.convertToInvoice(r.id);
      toast.success(`Tuition invoice ${inv.invoiceNo} generated`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate invoice');
    }
  };

  const doTransition = async (r: enrollmentsApi.Enrollment, next: enrollmentsApi.EnrollmentStatus) => {
    try {
      await enrollmentsApi.transition(r.id, next);
      toast.success(`Moved to ${next}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await enrollmentsApi.remove(deleteConfirm.id);
      toast.success('Enrollment deleted');
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete enrollment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Enrollments</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}
            title="Enrollment Settings — Courses + Classes">
            <Settings className="h-4 w-4" />
          </Button>
          {canAdd && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Enrollment
            </Button>
          )}
        </div>
      </div>

      <EnrollmentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enrollment register</CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by number, student, or class…"
                className="pl-8 h-9"
              />
            </div>
            {/* Status filter tabs */}
            <div className="inline-flex bg-gray-100 rounded-md p-0.5 text-xs">
              {(['all', 'enrolled', 'active', 'completed', 'withdrawn'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded font-medium transition capitalize ${
                    statusFilter === s ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No enrollments yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[110px]">Invoice</TableHead>
                    <TableHead className="text-right w-[220px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(r => {
                    const badge = STATUS_BADGES[r.status];
                    const klass = classInfo(r.classId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium tabular-nums">{r.enrollmentNo}</TableCell>
                        <TableCell className="text-sm">{studentName(r.studentId)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{klass?.name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-gray-600 tabular-nums">{r.enrollmentDate}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{r.total?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={`inline-flex items-center border ${badge.cls}`}>
                            {badge.icon}{badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 tabular-nums">
                          {r.convertedInvoiceId ? <span className="text-emerald-700">Billed</span> : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1 flex-wrap justify-end">
                            {r.status === 'enrolled' && !r.convertedInvoiceId && canBill && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => void doGenerateInvoice(r)} title="Generate tuition invoice">
                                <Receipt className="h-3.5 w-3.5 mr-1" />
                                Invoice
                              </Button>
                            )}
                            {r.status === 'enrolled' && canEdit && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => void doTransition(r, 'active')} title="Mark active (after payment)">
                                Activate
                              </Button>
                            )}
                            {r.status === 'active' && canEdit && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => void doTransition(r, 'completed')} title="Mark completed">
                                Complete
                              </Button>
                            )}
                            {(r.status === 'enrolled' || r.status === 'active') && canEdit && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-rose-700 hover:bg-rose-50"
                                onClick={() => void doTransition(r, 'withdrawn')} title="Withdraw">
                                Withdraw
                              </Button>
                            )}
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemove && !r.convertedInvoiceId && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteConfirm(r)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination {...pagination} />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.enrollmentNo}` : 'New enrollment'}</DialogTitle>
            <DialogDescription>
              Pick a student + class. Unit price defaults from the class's tuition fee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="enr-student" className="text-xs">
                  Student<span className="text-red-500"> *</span>
                </Label>
                <select
                  id="enr-student"
                  className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                  value={form.studentId}
                  onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}
                >
                  <option value="">— pick a student —</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-class" className="text-xs">
                  Class<span className="text-red-500"> *</span>
                </Label>
                <select
                  id="enr-class"
                  className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                  value={form.classId}
                  onChange={e => onClassChange(e.target.value)}
                >
                  <option value="">— pick a class —</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.termCode ? ` (${c.termCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="enr-date" className="text-xs">Enrollment date</Label>
                <Input
                  id="enr-date"
                  type="date"
                  value={form.enrollmentDate ?? ''}
                  onChange={e => setForm(f => ({ ...f, enrollmentDate: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-fee" className="text-xs">Tuition fee</Label>
                <Input
                  id="enr-fee"
                  type="number" min="0" step="0.01" className="tabular-nums"
                  value={form.unitPrice == null ? '' : String(form.unitPrice)}
                  onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-qty" className="text-xs">Quantity</Label>
                <Input
                  id="enr-qty"
                  type="number" min="1" step="1" className="tabular-nums"
                  value={form.quantity == null ? '' : String(form.quantity)}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enr-notes" className="text-xs">Notes</Label>
              <Input
                id="enr-notes"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={o => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.enrollmentNo} will be removed permanently.
              This is only possible for enrollments that haven't been billed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
