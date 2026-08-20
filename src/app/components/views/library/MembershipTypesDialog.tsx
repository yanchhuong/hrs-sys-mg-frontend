/**
 * V-library-membership — Membership Types settings dialog.
 *
 * <p>Reached from the gear icon on the Members page header. Manages
 * the priced tiers (Gold / Silver / Family / …) that fill the Members
 * form's Type dropdown. Types with duration_days help Phase 2 compute
 * expiry_date automatically when a member is renewed.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCcw, Settings2, Info, BellRing, Mail, Send } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../../ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Switch } from '../../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import * as library from '../../../api/library';
import { useConfirm } from '../../../context/ConfirmContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fired after a save/delete so the parent Members page can refresh
   *  its Type dropdown without a page reload. */
  onChanged?: () => void;
}

interface FormState {
  name: string;
  price: string;
  currency: string;
  durationDays: string;
  notes: string;
  active: boolean;
}

const EMPTY: FormState = { name: '', price: '0', currency: 'USD', durationDays: '', notes: '', active: true };

export function MembershipTypesDialog({ open, onOpenChange, onChanged }: Props) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<library.MembershipType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await library.membershipTypes.list()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const startNew = () => { setEditingId(null); setForm(EMPTY); };
  const startEdit = (t: library.MembershipType) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      price: String(t.price ?? 0),
      currency: t.currency ?? 'USD',
      durationDays: t.durationDays == null ? '' : String(t.durationDays),
      notes: t.notes ?? '',
      active: t.active,
    });
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const dur = form.durationDays.trim() === '' ? null : Number(form.durationDays);
      const payload: library.MembershipTypeInput = {
        name: form.name.trim(),
        price: Number(form.price) || 0,
        currency: form.currency || 'USD',
        durationDays: dur != null && !Number.isNaN(dur) ? dur : null,
        notes: form.notes || undefined,
        active: form.active,
      };
      if (editingId) await library.membershipTypes.update(editingId, payload);
      else            await library.membershipTypes.create(payload);
      toast.success(editingId ? 'Type updated' : 'Type added');
      startNew();
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const remove = async (t: library.MembershipType) => {
    const ok = await confirm({
      title: 'Delete membership type?',
      message: `Existing members already using "${t.name}" keep their label — the type just stops showing in the picker.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await library.membershipTypes.remove(t.id);
      toast.success('Type deleted');
      if (editingId === t.id) startNew();
      await load();
      onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const activeCount = useMemo(() => rows.filter(r => r.active).length, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-600" />
            Library Settings
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button"
                          className="text-gray-400 hover:text-gray-600 cursor-help"
                          aria-label="What this dialog is for">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  Priced tiers used in the Members form's Type picker + renewal invoices, plus reminder scheduling.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="types">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="types" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Types
              {rows.length > 0 && <span className="text-xs text-gray-500">({activeCount}/{rows.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="flex items-center gap-2">
              <BellRing className="h-4 w-4" /> Reminders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left — list of types */}
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <div className="text-xs font-semibold uppercase text-gray-600">Existing types</div>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {rows.map(t => (
                <button
                  key={t.id}
                  onClick={() => startEdit(t)}
                  className={`w-full text-left px-3 py-2 border-b hover:bg-gray-50 flex items-center justify-between ${editingId === t.id ? 'bg-indigo-50' : ''}`}
                >
                  <div>
                    <div className="font-medium text-sm">{t.name}
                      {!t.active && <Badge variant="secondary" className="ml-2 text-[10px]">inactive</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 tabular-nums">
                      {t.currency} {Number(t.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {t.durationDays ? ` · ${t.durationDays}d` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon"
                            onClick={(e) => { e.stopPropagation(); void remove(t); }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </button>
              ))}
              {rows.length === 0 && !loading && (
                <div className="px-3 py-6 text-center text-sm text-gray-500">
                  No types yet — add one on the right →
                </div>
              )}
            </div>
          </div>

          {/* Right — add/edit form */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-gray-600">
              {editingId ? 'Edit type' : 'New type'}
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input placeholder="Gold / Silver / Family / …"
                     value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label>Price</Label>
                <Input type="number" step="0.01" min="0" value={form.price}
                       onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="KHR">KHR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (days) — optional</Label>
              <Input type="number" min="0" placeholder="30, 365, blank = bespoke"
                     value={form.durationDays}
                     onChange={e => setForm({ ...form, durationDays: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">Active</span>
              <Switch checked={form.active}
                      onCheckedChange={v => setForm({ ...form, active: v })} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={() => void save()} disabled={saving}>
                {editingId
                  ? (<><Pencil className="h-4 w-4 mr-2" /> Save Changes</>)
                  : (<><Plus className="h-4 w-4 mr-2" /> Add Type</>)}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={startNew}>Clear</Button>
              )}
            </div>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="reminders" className="pt-4">
            <RemindersPanel onSaved={onChanged} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── V-library-membership-reminder — Reminders tab body ─────────── */

function RemindersPanel({ onSaved }: { onSaved?: () => void }) {
  const [s, setS] = useState<library.LibrarySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    library.settings.get()
      .then(setS)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Load failed'));
  }, []);

  if (!s) return <div className="py-8 text-center text-sm text-gray-500">Loading settings…</div>;

  const save = async () => {
    setSaving(true);
    try {
      const next = await library.settings.update({
        renewalReminderEnabled: s.renewalReminderEnabled,
        renewalReminderDaysBefore: s.renewalReminderDaysBefore,
        channelEmail: s.channelEmail,
        channelTelegram: s.channelTelegram,
        telegramLinkTemplate: s.telegramLinkTemplate,
      });
      setS(next);
      toast.success('Reminder settings saved');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border p-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <BellRing className="h-5 w-5 mt-0.5 text-indigo-600" />
          <div>
            <div className="text-sm font-medium">Send renewal reminders</div>
            <p className="text-xs text-gray-500 mt-0.5">
              A daily job checks members whose current period ends the configured number of days from today.
            </p>
          </div>
        </div>
        <Switch checked={s.renewalReminderEnabled}
                onCheckedChange={v => setS({ ...s, renewalReminderEnabled: v })} />
      </div>

      <div className={s.renewalReminderEnabled ? '' : 'opacity-50 pointer-events-none'}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Days before expiry</Label>
            <Input type="number" min="1" max="365"
                   value={s.renewalReminderDaysBefore}
                   onChange={e => setS({ ...s, renewalReminderDaysBefore: Number(e.target.value) || 0 })} />
            <p className="text-xs text-gray-500 mt-1">Common: 7 · 14 · 30 · 60</p>
          </div>
          <div className="rounded-md border p-3 text-xs text-gray-600 self-start">
            <div className="font-medium text-gray-800 mb-1">Preview</div>
            Members whose <span className="font-mono">expiry_date</span> is
            <span className="font-mono"> today + {s.renewalReminderDaysBefore}d </span>
            get a reminder tomorrow morning.
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold">Delivery channels</div>
          <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-gray-50">
            <Switch checked={s.channelEmail}
                    onCheckedChange={v => setS({ ...s, channelEmail: v })} />
            <Mail className="h-4 w-4 text-blue-600" />
            <div>
              <div className="text-sm font-medium">Email</div>
              <div className="text-xs text-gray-500">Sent to each member's email if one is on file.</div>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-gray-50">
            <Switch checked={s.channelTelegram}
                    onCheckedChange={v => setS({ ...s, channelTelegram: v })} />
            <Send className="h-4 w-4 text-sky-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">Telegram</div>
              <div className="text-xs text-gray-500">Logs a shareable message; admin can forward manually.</div>
            </div>
          </label>
          {s.channelTelegram && (
            <div>
              <Label>Telegram link / template (optional)</Label>
              <Textarea rows={2}
                        placeholder="Optional message tail — e.g. Renew at https://t.me/example_bot?start=renew"
                        value={s.telegramLinkTemplate ?? ''}
                        onChange={e => setS({ ...s, telegramLinkTemplate: e.target.value })} />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Reminder Settings'}
        </Button>
      </div>
    </div>
  );
}
