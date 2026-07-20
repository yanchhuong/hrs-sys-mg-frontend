import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Plus, Pencil, Trash2, Loader2, Settings, X, Send, Bell } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import * as itemsApi from '../../api/paymentPlanItems';
import * as paymentPlansApi from '../../api/paymentPlans';
import * as accountingSettingsApi from '../../api/accountingSettings';
import { useAuth } from '../../context/AuthContext';

/**
 * Per-tenant catalogue for the subject of a Payment Plan.
 *
 * <p>Tabs = plan type (Installment, Rental, Loan, Tuition, Custom).
 * Under each tab a two-column form (Name + optional Description +
 * Active toggle) sits above the existing rows. Duplicate names
 * inside the same (tenant, planType) are rejected by the BE — the
 * FE relies on that instead of pre-flighting.</p>
 *
 * <p>Gated on the {@code payment_plan} permission module — view to
 * read, create/update/delete to manage.</p>
 */
export function PaymentPlanItemsDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canWrite  = canCreate('payment_plan') || canUpdate('payment_plan');
  const canRemove = canDelete('payment_plan');

  /** Outer view — 'items' is the catalogue, 'reminders' is the
   *  Telegram-reminder cadence editor. Both live in this dialog so
   *  the ⚙ button on the Payment Plans page is one entry point. */
  const [topTab, setTopTab] = useState<'items' | 'reminders'>('items');
  const [rows, setRows] = useState<itemsApi.PaymentPlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<itemsApi.PaymentPlanItem | null>(null);
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [price, setPrice]       = useState('');
  const [active, setActive]     = useState(true);
  const [saving, setSaving]     = useState(false);
  /** Add-item popup. Opens on the "+ Add" button, on the Edit row
   *  icon, and closes on Save success / Cancel. */
  const [formOpen, setFormOpen] = useState(false);

  /** Reminder-tab state — settings for scope='payment_plan' pulled
   *  from accounting_settings. Load on tab enter, save on Save. */
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving,  setSettingsSaving]  = useState(false);

  const resetForm = () => {
    setEditing(null); setName(''); setDesc(''); setPrice(''); setActive(true);
  };
  const openCreate = () => { resetForm(); setFormOpen(true); };
  const openEdit = (r: itemsApi.PaymentPlanItem) => { startEdit(r); setFormOpen(true); };

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      // Flat catalogue — every item is usable across every plan
      // type (Installment / Rental / Loan / Tuition / Custom), so
      // the list request drops the planType filter and returns
      // everything in one bucket.
      setRows(await itemsApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load items');
    } finally { setLoading(false); }
  }, [open]);

  useEffect(() => { void load(); }, [load]);

  /** Lazy-fetch settings when the operator flips to the Reminders
   *  tab. Kept out of `open` effect so the Items path doesn't pay a
   *  round-trip it doesn't need. */
  useEffect(() => {
    if (!open || topTab !== 'reminders') return;
    setSettingsLoading(true);
    accountingSettingsApi.get('payment_plan')
      .then(setSettings)
      .catch(() => setSettings(accountingSettingsApi.defaultsFor('payment_plan')))
      .finally(() => setSettingsLoading(false));
  }, [open, topTab]);

  const patchSettings = (p: Partial<accountingSettingsApi.AccountingSettings>) =>
    setSettings(cur => (cur ? { ...cur, ...p } : cur));

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const saved = await accountingSettingsApi.update('payment_plan', settings);
      setSettings(saved);
      toast.success('Reminder settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSettingsSaving(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const trimmedPrice = price.trim();
    const numericPrice = trimmedPrice === '' ? null : Number(trimmedPrice);
    if (numericPrice === null || !(numericPrice >= 0)) {
      toast.error('Price is required');
      return;
    }
    setSaving(true);
    try {
      const req: itemsApi.UpsertPaymentPlanItem = {
        name: name.trim(),
        // planType is retained on the DB row (V259 NOT NULL check),
        // but no longer surfaced in the UI — the catalogue is now
        // cross-plan. Preserve the existing value when editing,
        // stamp 'custom' when creating so the CHECK constraint
        // stays happy.
        planType: editing?.planType ?? 'custom',
        description: description.trim() || null,
        price: numericPrice,
        active,
      };
      if (editing) {
        await itemsApi.update(editing.id, req);
        toast.success('Item updated');
      } else {
        await itemsApi.create(req);
        toast.success('Item added');
      }
      resetForm();
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const startEdit = (r: itemsApi.PaymentPlanItem) => {
    setEditing(r);
    setName(r.name);
    setDesc(r.description ?? '');
    setPrice(r.price == null ? '' : String(r.price));
    setActive(r.active);
  };

  const handleDelete = async (r: itemsApi.PaymentPlanItem) => {
    if (!confirm(`Delete "${r.name}"? Plans already written against it stay unchanged.`)) return;
    try {
      await itemsApi.remove(r.id);
      toast.success('Item deleted');
      if (editing?.id === r.id) resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 sm:max-w-6xl">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <Settings className="h-4 w-4 text-emerald-600" />
            Settings
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Catalogue what a plan is about — Room / Utility / Car for rentals, House / Condo / Flat for installments, and so on.
          </p>
        </DialogHeader>

        {/* Left menu — flat two-entry list (Items + Reminders).
            Items are a single tenant-wide catalogue usable across
            EVERY plan type (Installment / Rental / Loan / Tuition /
            Custom), so there's no need to fan them into per-type
            sub-entries anymore. */}
        <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr] overflow-hidden">
          <nav
            role="tablist"
            aria-label="Payment plan settings section"
            className="flex flex-col gap-1 p-3 border-r bg-gray-50/60 overflow-y-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'items'}
              onClick={() => setTopTab('items')}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm text-left transition ${
                topTab === 'items'
                  ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                  : 'text-gray-800 font-medium hover:bg-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              Items
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'reminders'}
              onClick={() => setTopTab('reminders')}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm text-left transition ${
                topTab === 'reminders'
                  ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                  : 'text-gray-800 font-medium hover:bg-white'
              }`}
            >
              <Bell className="h-4 w-4" />
              Reminders
            </button>
          </nav>

          <div className="px-6 py-4 min-w-0 overflow-y-auto space-y-4">
        {topTab === 'reminders' ? (
          /* Reminders — Telegram cadence for each schedule row on
             active plans. Fields mirror the sale-scope invoice
             reminder UX so the operator sees a familiar shape. */
          settingsLoading || !settings ? (
            <div className="text-xs text-gray-500 italic text-center py-10">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading settings…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Before due</div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <Switch
                      checked={settings.ppReminderBeforeDueEnabled}
                      onCheckedChange={v => patchSettings({ ppReminderBeforeDueEnabled: v })}
                    />
                    Send a reminder
                  </label>
                  <span className="text-xs text-gray-500">
                    <Input
                      type="number" min={0} max={365}
                      value={settings.ppReminderBeforeDueDays}
                      onChange={e => patchSettings({ ppReminderBeforeDueDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                      className="inline-block w-16 h-7 text-xs text-right tabular-nums mx-1"
                      disabled={!settings.ppReminderBeforeDueEnabled}
                    />
                    day(s) before each installment's due date.
                  </span>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">After due</div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch
                    checked={settings.ppReminderAfterDueEnabled}
                    onCheckedChange={v => patchSettings({ ppReminderAfterDueEnabled: v })}
                  />
                  Chase installments that go past due
                </label>
                <div className="flex items-center gap-3 pl-8 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={settings.ppReminderAfterDueRepeat}
                      onCheckedChange={v => patchSettings({ ppReminderAfterDueRepeat: v })}
                      disabled={!settings.ppReminderAfterDueEnabled}
                    />
                    Keep re-sending
                  </label>
                  <Select
                    value={settings.ppReminderAfterDueFrequency}
                    onValueChange={v => patchSettings({ ppReminderAfterDueFrequency: v as 'daily' | 'weekly' })}
                    disabled={!settings.ppReminderAfterDueEnabled || !settings.ppReminderAfterDueRepeat}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Message template</div>
                <p className="text-[11px] text-gray-500">
                  Placeholders: <code>{'{customerName}'}</code>, <code>{'{planNo}'}</code>, <code>{'{installmentNo}'}</code>, <code>{'{termsCount}'}</code>, <code>{'{amount}'}</code>, <code>{'{dueDate}'}</code>
                </p>
                <Textarea
                  value={settings.ppReminderTemplate}
                  onChange={e => patchSettings({ ppReminderTemplate: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer pt-1">
                  <Switch
                    checked={settings.ppReminderResendSchedule}
                    onCheckedChange={v => patchSettings({ ppReminderResendSchedule: v })}
                  />
                  Also re-send the schedule summary alongside the reminder
                </label>
              </div>

              <div className="text-[11px] text-gray-500 italic">
                Reminders run daily at 09:15 server time. Only fires for customers who've linked their Telegram to this tenant, and only on schedules for <b>Active</b> plans with a positive balance.
              </div>

              <div className="flex justify-end pt-1">
                <Button onClick={handleSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Save reminder settings
                </Button>
              </div>
            </div>
          )
        ) : (
          <>
            {/* Header strip — flat title + row count + Add button. */}
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-800">Items</div>
                <div className="text-[11px] text-gray-500">· {rows.length} row{rows.length === 1 ? '' : 's'}</div>
              </div>
              {canWrite && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Add item
                </Button>
              )}
            </div>

            <div className="min-w-0 space-y-4">

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-28 text-right">Price</TableHead>
                      <TableHead className="w-24 text-center">Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-gray-500 py-6">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-gray-500 py-8">
                          No items yet. Click <b>+ Add item</b> above to get started.
                        </TableCell>
                      </TableRow>
                    ) : rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs text-gray-600 truncate max-w-md" title={r.description ?? ''}>
                          {r.description || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.price == null ? <span className="text-gray-400">—</span> : `$${Number(r.price).toFixed(2)}`}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.active
                            ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                            : <Badge variant="outline" className="text-gray-500">Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {canWrite && (
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(r)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canRemove && (
                              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDelete(r)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Nested Add / Edit popup — opens on the "+ Add" button in
       *  the header strip and on any row's Edit icon. Cancel just
       *  closes without touching the state; Save fires the same
       *  handleSave that the old inline form used, then closes the
       *  popup and reloads the list. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit item' : 'Add item'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Room A · House B2 · Car · Motorbike"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Price <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(auto-fills Total Amount)</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Optional — a short note the operator will see in the picker."
                maxLength={2000}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
              <Switch checked={active} onCheckedChange={setActive} />
              Active
            </label>
          </div>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => { setFormOpen(false); resetForm(); }} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              {editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
