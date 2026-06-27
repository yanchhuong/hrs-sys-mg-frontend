import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import * as warehousesApi from '../../api/warehouses';
import { Plus, Pencil, Trash2, Warehouse as WarehouseIcon, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface FormState {
  name: string;
  code: string;
  address: string;
  manager: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  address: '',
  manager: '',
  enabled: true,
};

/**
 * Stock → Warehouse. Standalone CRUD page. The Items page surfaces
 * the column / picker only when the Item-Settings → Warehouse toggle
 * is on, but the warehouses themselves are always manageable here so
 * a tenant can register locations before flipping the feature.
 */
export function Warehouses() {
  const { t } = useI18n();
  const { canCreate, canUpdate, canDelete } = useAuth();
  // Shares the stock perm — registering warehouses is part of the
  // Stock surface (per user direction). A future split into a
  // dedicated permission key is a one-line nav.ts swap away.
  const canAdd    = canCreate('stock');
  const canEdit   = canUpdate('stock');
  const canRemove = canDelete('stock');

  const [rows, setRows] = useState<warehousesApi.Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<warehousesApi.Warehouse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<warehousesApi.Warehouse | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await warehousesApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const pagination = usePagination(useMemo(() => rows, [rows]), 25);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (w: warehousesApi.Warehouse) => {
    setEditing(w);
    setForm({
      name: w.name,
      code: w.code ?? '',
      address: w.address ?? '',
      manager: w.manager ?? '',
      enabled: w.enabled,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Warehouse name is required'); return; }
    setSaving(true);
    try {
      const payload: warehousesApi.WarehouseRequest = {
        name,
        code: form.code.trim() || undefined,
        address: form.address.trim() || undefined,
        manager: form.manager.trim() || undefined,
        enabled: form.enabled,
      };
      if (editing) await warehousesApi.update(editing.id, payload);
      else         await warehousesApi.create(payload);
      toast.success(editing ? 'Warehouse updated' : 'Warehouse created');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await warehousesApi.remove(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {t('nav.stock.warehouse') || 'Warehouse'}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                    aria-label="What is Warehouse?"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Storage locations an item can be filed under. Surfaces on
                  the Items page (column + filter + picker) only when the
                  Item-Settings → Warehouse toggle is on.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canAdd && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Warehouse
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-blue-600" />
            Locations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              No warehouses yet.{canAdd && <> Click <strong>Add Warehouse</strong> to create the first one.</>}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Code</TableHead>
                    <TableHead>Warehouse Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="w-[180px]">Manager</TableHead>
                    <TableHead className="text-center w-[90px]">Status</TableHead>
                    {(canEdit || canRemove) && (
                      <TableHead className="text-right w-[100px]">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs text-gray-600">
                        {w.code || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {w.address || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {w.manager || <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={w.enabled ? 'default' : 'outline'}>
                          {w.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {(canEdit || canRemove) && (
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-7"
                                onClick={() => openEdit(w)} title="Edit" aria-label="Edit warehouse">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemove && (
                              <Button size="sm" variant="ghost"
                                className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteTarget(w)} title="Remove" aria-label="Remove warehouse">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit warehouse' : 'Add warehouse'}</DialogTitle>
            <DialogDescription className="sr-only">
              Storage location used to file stock items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Main Store"
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Code</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder="WH01"
                  maxLength={32}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Location</Label>
              <Textarea
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Phnom Penh, …"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Manager</Label>
              <Input
                value={form.manager}
                onChange={e => setForm({ ...form, manager: e.target.value })}
                placeholder="Person running this location"
                maxLength={255}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">Active</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={v => setForm({ ...form, enabled: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Items currently filed here keep their other fields; their
              Warehouse column resets to blank.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
