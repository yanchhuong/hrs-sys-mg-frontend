import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FileText, FileSignature, Receipt, ShoppingBag, ShoppingCart, Save, Info,
  Warehouse as WarehouseIcon, Eye, Plus, Pencil, Trash2, Loader2, ScanBarcode, Users, Search,
} from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as itemsApi from '../../api/items';
import * as warehousesApi from '../../api/warehouses';
import * as usersApi from '../../api/users';
import { useAuth } from '../../context/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (next: itemsApi.UsageSettings) => void;
}

type Section = 'usage' | 'warehouse' | 'barcode';

/**
 * Items Settings popup — same left-menu + body layout as
 * {@link AccountingSettingsDialog} so the surface feels consistent.
 *
 * <p>Sections:</p>
 * <ul>
 *   <li><b>Usage</b> — per-document toggles for the StockItemPicker.</li>
 *   <li><b>Warehouse</b> — feature gate + CRUD list of storage
 *       locations. When the gate is off the body is collapsed to just
 *       the toggle so the operator can't accidentally seed warehouses
 *       on a tenant that doesn't want the feature.</li>
 * </ul>
 */
export function StockItemUsageSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>('usage');
  const [form, setForm] = useState<itemsApi.UsageSettings>({
    enabledForInvoice: false,
    enabledForQuotation: false,
    enabledForVoucher: false,
    enabledForBill: false,
    enabledForPos: false,
    enabledForWarehouse: false,
    enabledForBarcode: false,
    updatedAt: null,
  });

  // Warehouse CRUD list state — loaded once on first open of the
  // Warehouse section so the dialog open doesn't pay a network hop
  // for tenants that never visit the section.
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);
  const [warehousesLoaded, setWarehousesLoaded] = useState(false);
  const [whEditing, setWhEditing] = useState<warehousesApi.Warehouse | null>(null);
  const [whDialogOpen, setWhDialogOpen] = useState(false);
  const [whForm, setWhForm] = useState<warehousesApi.WarehouseRequest>({
    name: '', code: '', address: '', enabled: true,
  });
  const [whSaving, setWhSaving] = useState(false);
  const [whDeleteTarget, setWhDeleteTarget] = useState<warehousesApi.Warehouse | null>(null);

  // V389 — users assigned to a warehouse. Only an admin assigns (the
  // server refuses anyone else, and only an admin may list users), so the
  // picker, the user list and the userIds in the save are admin-only.
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [allUsers, setAllUsers] = useState<usersApi.User[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const userLabel = (u: usersApi.User) => u.name?.trim() || u.email;
  const userById = new Map(allUsers.map(u => [u.id, u]));

  // Re-fetch usage settings on every dialog open so closing without
  // saving leaves no in-memory stale state on the next visit.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    itemsApi.getUsageSettings()
      .then(setForm)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
    setSection('usage');
  }, [open]);

  const loadWarehouses = async () => {
    try {
      setWarehouses(await warehousesApi.list());
      if (isAdmin && allUsers.length === 0) {
        usersApi.list({ size: 500 }).then(r => setAllUsers(r.data ?? [])).catch(() => { /* picker stays empty */ });
      }
      setWarehousesLoaded(true);
    } catch (e) {
      // Soft-fail: a tenant without stock.view perm gets a 403, the
      // empty list is the correct rendering.
      toast.error(e instanceof Error ? e.message : 'Failed to load warehouses');
      setWarehousesLoaded(true);
    }
  };

  useEffect(() => {
    if (open && section === 'warehouse' && !warehousesLoaded) {
      void loadWarehouses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section, warehousesLoaded]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await itemsApi.putUsageSettings(form);
      setForm(next);
      onSaved?.(next);
      toast.success('Settings saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  /** Label + (i) hint pattern shared by every toggle row.
   *  Replaces the previous two-line label + hint paragraph so the
   *  body stays scannable on smaller screens. */
  const ToggleRow = ({
    icon, label, hint, value, onChange,
  }: {
    icon: React.ReactNode;
    label: string;
    hint: string;
    value: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="text-gray-500 shrink-0">{icon}</div>
        <Label className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
          {label}
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help"
                  aria-label={`About ${label}`}
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={loading || saving} />
    </div>
  );

  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'usage',     label: 'Usage',     hint: 'Where the picker appears',  icon: <Eye className="h-4 w-4" /> },
    { key: 'warehouse', label: 'Warehouse', hint: 'Storage locations',         icon: <WarehouseIcon className="h-4 w-4" /> },
    { key: 'barcode',   label: 'Barcode',   hint: 'Scan / generate codes',     icon: <ScanBarcode className="h-4 w-4" /> },
  ];

  /* ------------------- warehouse CRUD ------------------- */

  const openCreateWarehouse = () => {
    setWhEditing(null);
    setWhForm({ name: '', code: '', address: '', enabled: true, userIds: [] });
    setUserQuery('');
    setWhDialogOpen(true);
  };
  const openEditWarehouse = (w: warehousesApi.Warehouse) => {
    setWhEditing(w);
    setWhForm({
      name: w.name,
      code: w.code ?? '',
      address: w.address ?? '',
      enabled: w.enabled,
      userIds: w.userIds ?? [],
    });
    setUserQuery('');
    setWhDialogOpen(true);
  };

  const saveWarehouse = async () => {
    const name = whForm.name.trim();
    if (!name) { toast.error('Warehouse name is required'); return; }
    setWhSaving(true);
    try {
      const payload: warehousesApi.WarehouseRequest = {
        name,
        code: whForm.code?.trim() || undefined,
        address: whForm.address?.trim() || undefined,
        enabled: whForm.enabled,
        // Omitted for non-admins: null on the server leaves the
        // assignments as they are.
        ...(isAdmin ? { userIds: whForm.userIds ?? [] } : {}),
      };
      if (whEditing) await warehousesApi.update(whEditing.id, payload);
      else           await warehousesApi.create(payload);
      toast.success(whEditing ? 'Warehouse updated' : 'Warehouse created');
      setWhDialogOpen(false);
      await loadWarehouses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setWhSaving(false);
    }
  };

  const confirmWarehouseDelete = async () => {
    if (!whDeleteTarget) return;
    try {
      await warehousesApi.remove(whDeleteTarget.id);
      toast.success(`Removed ${whDeleteTarget.name}`);
      setWhDeleteTarget(null);
      await loadWarehouses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              Item settings
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="About item settings"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Toggle whether the line forms on each document type
                    may pick from your Stock catalog, and manage optional
                    storage locations (Warehouses).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Per-document picker toggles and optional warehouse list.
            </DialogDescription>
          </DialogHeader>

          {/* Split body — left aside + right pane. Mirrors AccountingSettingsDialog. */}
          <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
            <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
              {/* v-settings-menu-tooltip — hint on hover, labels stay single-line. */}
              <TooltipProvider delayDuration={200}>
                {menu.map(m => {
                  const active = section === m.key;
                  return (
                    <Tooltip key={m.key}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSection(m.key)}
                          className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 transition-colors flex items-center gap-2 ${
                            active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-700 hover:bg-white'
                          }`}
                        >
                          <span className={active ? 'text-blue-600' : 'text-gray-500'}>{m.icon}</span>
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">{m.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs">
                        {m.hint}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </aside>

            <div className="overflow-y-auto p-6 space-y-4">
              {section === 'usage' && (
                <div className="space-y-0">
                  <h3 className="text-sm font-semibold mb-2">Usage</h3>
                  <ToggleRow
                    icon={<FileText className="h-4 w-4" />}
                    label="Invoice"
                    hint="Show the catalog picker on Invoice line items."
                    value={form.enabledForInvoice}
                    onChange={v => setForm(f => ({ ...f, enabledForInvoice: v }))}
                  />
                  <ToggleRow
                    icon={<FileSignature className="h-4 w-4" />}
                    label="Quotation"
                    hint="Show the catalog picker on Quotation line items."
                    value={form.enabledForQuotation}
                    onChange={v => setForm(f => ({ ...f, enabledForQuotation: v }))}
                  />
                  <ToggleRow
                    icon={<Receipt className="h-4 w-4" />}
                    label="Voucher"
                    hint="Show the catalog picker on Voucher line items."
                    value={form.enabledForVoucher}
                    onChange={v => setForm(f => ({ ...f, enabledForVoucher: v }))}
                  />
                  <ToggleRow
                    icon={<ShoppingBag className="h-4 w-4" />}
                    label="Bill"
                    hint="Reserved — the catalog picker for purchase bills will respect this when it ships."
                    value={form.enabledForBill}
                    onChange={v => setForm(f => ({ ...f, enabledForBill: v }))}
                  />
                  <ToggleRow
                    icon={<ShoppingCart className="h-4 w-4" />}
                    label="POS"
                    hint="Show this item in the POS page's items grid for counter checkout."
                    value={form.enabledForPos}
                    onChange={v => setForm(f => ({ ...f, enabledForPos: v }))}
                  />
                </div>
              )}

              {section === 'warehouse' && (
                <div className="space-y-3">
                  <ToggleRow
                    icon={<WarehouseIcon className="h-4 w-4" />}
                    label="Use warehouses"
                    hint="When on, items can be assigned to a storage location and the Items page surfaces a Warehouse column + filter."
                    value={form.enabledForWarehouse}
                    onChange={v => setForm(f => ({ ...f, enabledForWarehouse: v }))}
                  />

                  {form.enabledForWarehouse && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Locations</h3>
                        <Button size="sm" onClick={openCreateWarehouse}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
                        </Button>
                      </div>

                      {!warehousesLoaded ? (
                        <div className="text-center py-6 text-sm text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…
                        </div>
                      ) : warehouses.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-400 border rounded-md">
                          No warehouses yet. Click <strong>Add</strong> to create the first one.
                        </div>
                      ) : (
                        <div className="border rounded-md divide-y">
                          {warehouses.map(w => (
                            <div key={w.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                              <div className="min-w-0">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  {w.name}
                                  {w.code && (
                                    <Badge variant="outline" className="tabular-nums text-[10px]">{w.code}</Badge>
                                  )}
                                  {!w.enabled && (
                                    <Badge variant="outline" className="text-gray-500">Disabled</Badge>
                                  )}
                                </div>
                                {w.address && (
                                  <div className="text-[11px] text-gray-500 truncate">{w.address}</div>
                                )}
                                {(w.userIds?.length ?? 0) > 0 && (
                                  <div className="text-[11px] text-blue-700 truncate flex items-center gap-1"
                                    title="Only these users see this warehouse's stock">
                                    <Users className="h-3 w-3 shrink-0" />
                                    {isAdmin && allUsers.length > 0
                                      ? w.userIds!.map(id => userById.get(id)).filter(Boolean).map(u => userLabel(u!)).join(', ')
                                      : `${w.userIds!.length} assigned user${w.userIds!.length === 1 ? '' : 's'}`}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                  onClick={() => openEditWarehouse(w)}
                                  title="Edit" aria-label="Edit warehouse">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setWhDeleteTarget(w)}
                                  title="Remove" aria-label="Remove warehouse">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* v-item-barcode (V302) — single toggle. When on, the
                  Items form + list surface the barcode field. No sub-
                  settings yet; scanner integration on POS / purchase
                  forms lands in a follow-up. */}
              {section === 'barcode' && (
                <div className="space-y-3">
                  <ToggleRow
                    icon={<ScanBarcode className="h-4 w-4" />}
                    label="Use barcodes"
                    hint="When on, the Items form shows a Barcode input + Generate button, and the Items table surfaces a Barcode column."
                    value={form.enabledForBarcode}
                    onChange={v => setForm(f => ({ ...f, enabledForBarcode: v }))}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={loading || saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warehouse Add / Edit dialog */}
      <Dialog open={whDialogOpen} onOpenChange={setWhDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{whEditing ? 'Edit warehouse' : 'Add warehouse'}</DialogTitle>
            <DialogDescription className="sr-only">
              Storage location used to file stock items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input
                  value={whForm.name}
                  onChange={e => setWhForm({ ...whForm, name: e.target.value })}
                  placeholder="Main Warehouse"
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Code</Label>
                <Input
                  value={whForm.code ?? ''}
                  onChange={e => setWhForm({ ...whForm, code: e.target.value })}
                  placeholder="WH-01"
                  maxLength={32}
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Address</Label>
              <Textarea
                value={whForm.address ?? ''}
                onChange={e => setWhForm({ ...whForm, address: e.target.value })}
                placeholder="Optional"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">Enabled</Label>
              <Switch
                checked={whForm.enabled ?? true}
                onCheckedChange={v => setWhForm({ ...whForm, enabled: v })}
              />
            </div>
            {isAdmin && (() => {
              const picked = new Set(whForm.userIds ?? []);
              const q = userQuery.trim().toLowerCase();
              const shown = allUsers.filter(u => !q
                || userLabel(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
              const toggle = (id: string) => {
                const next = new Set(picked);
                if (next.has(id)) next.delete(id); else next.add(id);
                setWhForm({ ...whForm, userIds: [...next] });
              };
              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600 flex items-center justify-between">
                    <span>Users</span>
                    <span className="text-gray-400 font-normal">{picked.size} selected</span>
                  </Label>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input value={userQuery} onChange={e => setUserQuery(e.target.value)}
                      placeholder="Search users…" className="h-8 pl-8 text-sm" />
                  </div>
                  <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
                    {shown.length === 0 ? (
                      <div className="text-center py-4 text-xs text-gray-400">
                        {allUsers.length === 0 ? 'Loading users…' : 'No user matches that search.'}
                      </div>
                    ) : shown.map(u => (
                      <label key={u.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600"
                          checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                        <span className="min-w-0 flex-1 truncate">{userLabel(u)}</span>
                        <span className="text-[11px] text-gray-400 capitalize shrink-0">{u.role}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    People picked here see only the warehouses they are assigned to. Anyone not assigned
                    to a warehouse sees all of them, and admins always see everything.
                  </p>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhDialogOpen(false)} disabled={whSaving}>
              Cancel
            </Button>
            <Button onClick={saveWarehouse} disabled={whSaving}>
              {whSaving ? 'Saving…' : whEditing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warehouse delete confirmation */}
      <AlertDialog open={!!whDeleteTarget} onOpenChange={o => !o && setWhDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              {whDeleteTarget?.name} will be deleted. Items currently filed here
              keep their other fields; their Warehouse column resets to blank.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmWarehouseDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
