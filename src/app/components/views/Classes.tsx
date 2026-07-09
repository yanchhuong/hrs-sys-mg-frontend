import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
import { Plus, Pencil, Trash2, Search, GraduationCap } from 'lucide-react';
import * as itemsApi from '../../api/items';
import * as employeesApi from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';

/**
 * Classes — School vertical page (v-school-classes). Backed by the
 * shared {@code stock_items} table with {@code type='class'} so
 * Enrollment (v-school-enrollment, next) can pick a Class the same
 * way a POS sale picks a Product. Per
 * [[erp-core-engine-vision]] Class = Item + a discriminator; no
 * separate table.
 *
 * <p>Class-only fields (V206 columns): teacher_id → employees FK,
 * capacity (int), term_code (free-text slug), start_date, end_date.
 * POS-specific fields (SKU, category, modifiers, image, warehouse)
 * are hidden here — the operator only sees what applies to a
 * classroom offering.</p>
 *
 * <p>Sidebar visibility gates on {@code module: 'class'} (see
 * nav.ts). Backend @PreAuthorize accepts either {@code stock} OR
 * {@code class} scopes so a School-only tenant with no Stock
 * module still passes the gate.</p>
 */
const emptyForm: itemsApi.ItemRequest = {
  name: '',
  description: '',
  unit: '',
  unitPrice: 0,
  unitCost: 0,
  active: true,
  type: 'class',
  teacherId: null,
  capacity: null,
  termCode: '',
  startDate: null,
  endDate: null,
};

export function Classes() {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('class');
  const canEdit = canUpdate('class');
  const canRemove = canDelete('class');

  const [rows, setRows] = useState<itemsApi.Item[]>([]);
  const [teachers, setTeachers] = useState<employeesApi.Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<itemsApi.Item | null>(null);
  const [form, setForm] = useState<itemsApi.ItemRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<itemsApi.Item | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // Backend query filters to type='class' so no client-side prune
      // needed. Size 200 covers the "small school" case; pagination
      // handles the rest via the shared hook below.
      const page = await itemsApi.list({ type: 'class', size: 200 });
      setRows(page.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Teachers list — every active employee is a candidate; the
    // tenant is expected to manage the roster separately. Kept
    // simple: no clinicalRole-style tag for teachers yet.
    (async () => {
      try {
        const emps = await employeesApi.list({ size: 500, status: 'active' });
        setTeachers(emps.content ?? []);
      } catch { /* soft-fail — form falls back to a blank picker */ }
    })();
  }, []);

  const teacherName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of teachers) map.set(e.apiId ?? e.id, e.name);
    return (id: string | null | undefined) => id ? map.get(id) ?? '—' : '—';
  }, [teachers]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(needle)
      || (r.termCode ?? '').toLowerCase().includes(needle)
      || teacherName(r.teacherId).toLowerCase().includes(needle)
    );
  }, [rows, q, teacherName]);

  const pagination = usePagination(filtered);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: itemsApi.Item) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? '',
      unit: c.unit ?? '',
      unitPrice: c.unitPrice ?? 0,
      unitCost: c.unitCost ?? 0,
      active: c.active ?? true,
      type: 'class',
      teacherId: c.teacherId ?? null,
      capacity: c.capacity ?? null,
      termCode: c.termCode ?? '',
      startDate: c.startDate ?? null,
      endDate: c.endDate ?? null,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Class name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await itemsApi.update(editing.id, form);
        toast.success('Class updated');
      } else {
        await itemsApi.create(form);
        toast.success('Class created');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save class');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await itemsApi.remove(deleteConfirm.id);
      toast.success('Class deleted');
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete class');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Classes</h1>
        {canAdd && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Class
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-emerald-600" />
            Class catalog
          </CardTitle>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by name, teacher, or term…"
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading && filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No classes yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[180px]">Teacher</TableHead>
                    <TableHead className="w-[120px]">Term</TableHead>
                    <TableHead className="w-[80px] text-right">Capacity</TableHead>
                    <TableHead className="w-[110px]">Start</TableHead>
                    <TableHead className="w-[110px]">End</TableHead>
                    <TableHead className="w-[100px] text-right">Fee</TableHead>
                    <TableHead className="text-right w-[88px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{teacherName(c.teacherId)}</TableCell>
                      <TableCell className="text-sm text-gray-600 tabular-nums">{c.termCode || '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums text-gray-600">{c.capacity ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600 tabular-nums">{c.startDate ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600 tabular-nums">{c.endDate ?? '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums text-gray-600">
                        {c.unitPrice != null ? c.unitPrice.toFixed(2) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canRemove && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteConfirm(c)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination {...pagination} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'New class'}</DialogTitle>
            <DialogDescription>
              Only the class name is required. Add teacher, term, dates, and tuition fee as available.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="class-name" className="text-xs">
                  Class name<span className="text-red-500"> *</span>
                </Label>
                <Input
                  id="class-name"
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Math Grade 7 (Morning)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-teacher" className="text-xs">Teacher</Label>
                <select
                  id="class-teacher"
                  className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                  value={form.teacherId ?? ''}
                  onChange={e => setForm(f => ({ ...f, teacherId: e.target.value || null }))}
                >
                  <option value="">—</option>
                  {teachers.map(t => (
                    <option key={t.apiId ?? t.id} value={t.apiId ?? t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-term" className="text-xs">Term code</Label>
                <Input
                  id="class-term"
                  value={form.termCode ?? ''}
                  onChange={e => setForm(f => ({ ...f, termCode: e.target.value }))}
                  placeholder="e.g. 2026-T1"
                  maxLength={32}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-start" className="text-xs">Start date</Label>
                <Input
                  id="class-start"
                  type="date"
                  value={form.startDate ?? ''}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-end" className="text-xs">End date</Label>
                <Input
                  id="class-end"
                  type="date"
                  value={form.endDate ?? ''}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-capacity" className="text-xs">Capacity</Label>
                <Input
                  id="class-capacity"
                  type="number" min="0" step="1"
                  className="tabular-nums"
                  value={form.capacity == null ? '' : String(form.capacity)}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, capacity: v === '' ? null : Number(v) }));
                  }}
                  placeholder="e.g. 30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-fee" className="text-xs">Tuition fee</Label>
                <Input
                  id="class-fee"
                  type="number" min="0" step="0.01"
                  className="tabular-nums"
                  value={form.unitPrice == null ? '' : String(form.unitPrice)}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, unitPrice: v === '' ? 0 : Number(v) }));
                  }}
                  placeholder="e.g. 120.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-desc" className="text-xs">Description</Label>
              <Input
                id="class-desc"
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional short description"
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
            <AlertDialogTitle>Delete class?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.name} will be removed from the catalog.
              Existing enrollments referencing this class stay in place.
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
