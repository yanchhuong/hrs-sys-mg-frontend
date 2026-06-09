import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import { Layers, Plus, Pencil, Trash2, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import * as platformApi from '../../../api/platform';

/**
 * Super Admin → Module Categories. Manages the platform-wide module
 * groupings (V74) that drive both Tenant Modules and the tenant
 * sidebar. Modules themselves come from the code-defined catalog
 * ({@link platformApi.ModuleCatalogResponse.allModules}); this page
 * only sets which category a module belongs to and how the category
 * itself is labelled / ordered.
 */
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

type EditState = {
  /** Empty when creating; carries the original key when editing. */
  key: string;
  label: string;
  sortOrder: string;
  /** True = edit existing (key field disabled), false = create new. */
  isEdit: boolean;
};

const EMPTY_EDIT: EditState = { key: '', label: '', sortOrder: '', isEdit: false };

export function ModuleCategories() {
  const [catalog, setCatalog] = useState<platformApi.ModuleCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editState, setEditState] = useState<EditState>(EMPTY_EDIT);
  const [deleteTarget, setDeleteTarget] = useState<platformApi.ModuleCategory | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await platformApi.moduleCategories.list();
      setCatalog(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // Map for the reassign dropdown — every other category becomes a
  // "Move to …" option per module row.
  const allCategories = catalog?.categories ?? [];
  const totalAssigned = useMemo(
    () => allCategories.reduce((acc, c) => acc + c.moduleKeys.length, 0),
    [allCategories],
  );

  const openCreate = () => {
    setEditState({
      ...EMPTY_EDIT,
      sortOrder: String((allCategories[allCategories.length - 1]?.moduleKeys.length ?? 0) + allCategories.length + 1),
    });
    setEditOpen(true);
  };

  const openEdit = (cat: platformApi.ModuleCategory, sortOrderHint: number) => {
    setEditState({ key: cat.key, label: cat.label, sortOrder: String(sortOrderHint), isEdit: true });
    setEditOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const sort = editState.sortOrder.trim() === '' ? undefined : Number(editState.sortOrder);
      if (editState.isEdit) {
        await platformApi.moduleCategories.update(editState.key, {
          label: editState.label.trim(),
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Category updated');
      } else {
        const key = slugify(editState.key || editState.label);
        if (!key) {
          toast.error('Key is required and must contain letters/digits');
          setSaving(false);
          return;
        }
        await platformApi.moduleCategories.create({
          key,
          label: editState.label.trim() || key,
          sortOrder: Number.isFinite(sort) ? sort : undefined,
        });
        toast.success('Category created');
      }
      setEditOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await platformApi.moduleCategories.delete(deleteTarget.key);
      toast.success(`Deleted '${deleteTarget.label}'`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      // Backend returns 409 with the "N modules still assigned" message;
      // surface it verbatim so the admin knows what to reassign first.
      toast.error(e instanceof Error ? e.message : 'Failed to delete category');
      setDeleteTarget(null);
    }
  };

  const handleReassign = async (moduleKey: string, newCategoryKey: string, sourceCategoryKey: string) => {
    if (newCategoryKey === sourceCategoryKey) return;
    try {
      await platformApi.moduleCategories.reassign(moduleKey, newCategoryKey);
      toast.success(`Moved '${moduleKey}'`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reassign');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Module Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Group modules into apps that appear on the Tenant Modules page
            and the tenant sidebar. Today: HR Management, Payroll &amp;
            Compensation, Administration. Add more (Accountant, Stock, …)
            as their modules ship.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Category
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
          {allCategories.length} categor{allCategories.length === 1 ? 'y' : 'ies'}
        </Badge>
        <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">
          {totalAssigned} of {catalog?.allModules.length ?? 0} modules assigned
        </Badge>
      </div>

      {loading && !catalog ? (
        <p className="text-sm text-gray-500">Loading categories…</p>
      ) : (
        <div className="space-y-4">
          {allCategories.map((cat, idx) => {
            const otherCats = allCategories.filter(c => c.key !== cat.key);
            return (
              <Card key={cat.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers className="h-4 w-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold">{cat.label}</CardTitle>
                        <CardDescription className="text-xs">
                          <code className="text-slate-500">{cat.key}</code>
                          <span className="mx-1.5 text-slate-300">·</span>
                          sort {idx + 1}
                          <span className="mx-1.5 text-slate-300">·</span>
                          {cat.moduleKeys.length} module{cat.moduleKeys.length === 1 ? '' : 's'}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openEdit(cat, idx + 1)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => setDeleteTarget(cat)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {cat.moduleKeys.length === 0 ? (
                    <p className="text-xs text-gray-500">No modules in this category yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {cat.moduleKeys.map(modKey => (
                        <div
                          key={modKey}
                          className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-200 bg-white"
                        >
                          <span className="text-sm capitalize truncate">
                            {modKey.replace(/-/g, ' ')}
                          </span>
                          {otherCats.length > 0 && (
                            <Select
                              value=""
                              onValueChange={v => handleReassign(modKey, v, cat.key)}
                            >
                              <SelectTrigger className="h-8 w-[140px] text-xs">
                                <SelectValue placeholder={
                                  <span className="flex items-center gap-1 text-slate-500">
                                    <MoveRight className="h-3 w-3" /> Move to…
                                  </span>
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                {otherCats.map(c => (
                                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editState.isEdit ? `Edit '${editState.key}'` : 'New category'}</DialogTitle>
            <DialogDescription>
              {editState.isEdit
                ? 'Rename or re-order the category. The key is the primary key and stays fixed — create a new category if you need a different one.'
                : 'Create a new app/category. The key is URL-safe and immutable once set; the label is what tenants see.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-key" className="text-xs">
                Key {editState.isEdit && <span className="text-gray-400">(immutable)</span>}
              </Label>
              <Input
                id="cat-key"
                value={editState.key}
                onChange={e => setEditState(s => ({ ...s, key: slugify(e.target.value) }))}
                placeholder="accounting"
                disabled={editState.isEdit}
              />
              <p className="text-[11px] text-gray-500">
                Lowercase a–z, 0–9, dashes. 2–32 chars. Used in the URL + DB.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-label" className="text-xs">Label</Label>
              <Input
                id="cat-label"
                value={editState.label}
                onChange={e => setEditState(s => ({ ...s, label: e.target.value }))}
                placeholder="Accountant"
              />
              <p className="text-[11px] text-gray-500">
                Display name shown on Tenant Modules and the tenant sidebar.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-sort" className="text-xs">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={editState.sortOrder}
                onChange={e => setEditState(s => ({ ...s, sortOrder: e.target.value }))}
                placeholder="1"
              />
              <p className="text-[11px] text-gray-500">
                Lower number renders first. Leave blank on create to append at the end.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : editState.isEdit ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete '{deleteTarget?.label}'?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleteTarget?.moduleKeys.length ?? 0) === 0
                ? 'This category has no modules assigned, so it can be safely removed.'
                : `${deleteTarget?.moduleKeys.length} module(s) are still assigned to this category. The backend will reject the delete with the list of modules to reassign first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
