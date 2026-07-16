import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Gift, Loader2, Plus, RefreshCw, Trash2, Edit3, Star, Stamp as StampIcon, Cake,
} from 'lucide-react';
import { loyalty } from '../../api/loyalty';
import type { LoyaltyProgram, LoyaltyType, UpsertLoyaltyProgram } from '../../api/loyalty';
import * as itemsApi from '../../api/items';
import type { Item } from '../../api/items';

const TYPE_META: Record<LoyaltyType, { label: string; icon: React.ReactNode; hint: string; cls: string }> = {
  POINT:    { label: 'Point',    icon: <Star className="h-4 w-4" />,      hint: 'Spend $X = earn N points; redeem points for cash discount.', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  STAMP:    { label: 'Stamp',    icon: <StampIcon className="h-4 w-4" />, hint: 'Buy N of a specific item = one free item (Buy X Get Y).',    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  BIRTHDAY: { label: 'Birthday', icon: <Cake className="h-4 w-4" />,      hint: 'Automatic free item on the customer\'s birth day.',           cls: 'border-pink-200 bg-pink-50 text-pink-700' },
};

/**
 * v-loyalty-mvp — Loyalty settings page. One flat list of Programs
 * across all three types; per-row Edit / Toggle-active / Delete.
 * The New / Edit dialog swaps its fields based on the picked type
 * so cashiers configuring a Stamp card don't get quizzed on point
 * rates.
 */
export function Loyalty() {
  const [rows, setRows] = useState<LoyaltyProgram[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyProgram | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, itemList] = await Promise.all([
        loyalty.list(),
        itemsApi.list({ size: 500 }).catch(() => ({ content: [] as Item[] })),
      ]);
      setRows(list);
      // itemsApi.list returns a PagedResponse<Item> with `content`.
      // Coerce defensively so a shape change doesn't crash the memo
      // below with "items is not iterable".
      setItems(Array.isArray(itemList?.content) ? itemList.content : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const itemName = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) m.set(i.id, i.name);
    return m;
  }, [items]);

  const openNew  = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: LoyaltyProgram) => { setEditing(r); setDialogOpen(true); };
  const doDelete = async (r: LoyaltyProgram) => {
    if (!confirm(`Delete "${r.name}"? Customer balances tied to this program will keep their history but new earns stop.`)) return;
    try {
      await loyalty.remove(r.id);
      toast.success('Program deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  const doToggle = async (r: LoyaltyProgram) => {
    try {
      await loyalty.update(r.id, {
        name: r.name, type: r.type, active: !r.active,
        rewardType: r.rewardType, buyQuantity: r.buyQuantity, rewardQuantity: r.rewardQuantity,
        rewardItemIds: r.rewardItemIds, earnPointPerAmount: r.earnPointPerAmount,
        earnPointPerItem: r.earnPointPerItem, redeemPointCost: r.redeemPointCost,
        redeemDiscountAmount: r.redeemDiscountAmount, minimumAmount: r.minimumAmount,
        expireDays: r.expireDays, startDate: r.startDate, endDate: r.endDate,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Gift className="h-5 w-5 text-blue-600" />
          Loyalty &amp; Rewards
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* v-loyalty-one-per-tenant — a Company runs a single
              policy at a time. Hide the New button once one
              exists so the operator edits it instead of trying
              to create a second (BE would reject with 409). */}
          {rows.length === 0 && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1.5" />
              New program
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Programs
            <span className="text-xs text-gray-500 font-normal ml-2">({rows.length})</span>
          </CardTitle>
          {rows.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-1">
              One loyalty policy per company — edit the program's <b>Type</b>
              {' '}to switch between Point, Stamp, or Birthday.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2 px-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-6">
              No loyalty programs yet. Click <b>New program</b> to create your first Point or Stamp card.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => {
                const meta = TYPE_META[r.type];
                return (
                  <li key={r.id} className={`px-6 py-3 flex items-center gap-3 ${!r.active ? 'opacity-60' : ''}`}>
                    <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border border-gray-200 bg-gray-50 text-gray-600">
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{r.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.cls}`}>{meta.label}</Badge>
                        {r.type === 'POINT' && r.earnPointPerAmount != null && (
                          <span>Every ${r.earnPointPerAmount} = 1 pt</span>
                        )}
                        {r.type === 'POINT' && r.redeemPointCost != null && r.redeemDiscountAmount != null && (
                          <span>· Redeem {r.redeemPointCost} pts → ${r.redeemDiscountAmount} off</span>
                        )}
                        {r.type === 'STAMP' && r.buyQuantity != null && r.rewardQuantity != null && (
                          <span>Buy {r.buyQuantity} → get {r.rewardQuantity} free ({itemsLabel(r.rewardItemIds, itemName)})</span>
                        )}
                        {r.type === 'BIRTHDAY' && (
                          <span>Free {itemsLabel(r.rewardItemIds, itemName)} on birthday</span>
                        )}
                      </div>
                    </div>
                    <Switch checked={r.active} onCheckedChange={() => void doToggle(r)} />
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(r)} title="Edit">
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-rose-600 hover:text-rose-800"
                            onClick={() => void doDelete(r)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ProgramDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        items={items}
        onSaved={() => void load()}
      />
    </div>
  );
}

function ProgramDialog({ open, onOpenChange, editing, items, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: LoyaltyProgram | null;
  items: Item[];
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [name, setName]         = useState('');
  const [type, setType]         = useState<LoyaltyType>('POINT');
  const [active, setActive]     = useState(true);
  const [buyQuantity, setBuyQuantity]           = useState<string>('');
  const [rewardQuantity, setRewardQuantity]     = useState<string>('1');
  const [rewardItemIds, setRewardItemIds]       = useState<string[]>([]);
  const [earnPointPerAmount, setEarnPointPerAmount] = useState<string>('1');
  const [redeemPointCost, setRedeemPointCost]   = useState<string>('100');
  const [redeemDiscountAmount, setRedeemDiscountAmount] = useState<string>('5');
  const [minimumAmount, setMinimumAmount]       = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setActive(editing.active);
      setBuyQuantity(str(editing.buyQuantity));
      setRewardQuantity(str(editing.rewardQuantity ?? 1));
      setRewardItemIds(editing.rewardItemIds ?? []);
      setEarnPointPerAmount(str(editing.earnPointPerAmount ?? 1));
      setRedeemPointCost(str(editing.redeemPointCost ?? 100));
      setRedeemDiscountAmount(str(editing.redeemDiscountAmount ?? 5));
      setMinimumAmount(str(editing.minimumAmount));
    } else {
      setName(''); setType('POINT'); setActive(true);
      setBuyQuantity(''); setRewardQuantity('1'); setRewardItemIds([]);
      setEarnPointPerAmount('1'); setRedeemPointCost('100'); setRedeemDiscountAmount('5');
      setMinimumAmount('');
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const rewardType = type === 'POINT' ? 'DISCOUNT'
                       : type === 'STAMP' ? 'FREE_ITEM'
                       : 'FREE_ITEM';
      const payload: UpsertLoyaltyProgram = {
        name: name.trim(), type, active, rewardType,
        buyQuantity: type === 'STAMP' ? num(buyQuantity) : null,
        rewardQuantity: type === 'STAMP' ? num(rewardQuantity) : null,
        rewardItemIds: (type === 'STAMP' || type === 'BIRTHDAY') ? rewardItemIds : [],
        earnPointPerAmount: type === 'POINT' ? numDec(earnPointPerAmount) : null,
        earnPointPerItem: null,
        redeemPointCost: type === 'POINT' ? num(redeemPointCost) : null,
        redeemDiscountAmount: type === 'POINT' ? numDec(redeemDiscountAmount) : null,
        minimumAmount: numDec(minimumAmount),
        expireDays: null,
      };
      if (isEdit && editing) await loyalty.update(editing.id, payload);
      else                   await loyalty.create(payload);
      toast.success(isEdit ? 'Program updated' : 'Program created');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const meta = TYPE_META[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit program' : 'New loyalty program'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 mt-1"
                   placeholder="e.g. Coffee Stamp, Customer Point" maxLength={120} autoFocus={!isEdit} />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={v => setType(v as LoyaltyType)}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="POINT">    <span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Point</span></SelectItem>
                <SelectItem value="STAMP">    <span className="inline-flex items-center gap-1.5"><StampIcon className="h-3.5 w-3.5" /> Stamp (Buy X Get Y)</span></SelectItem>
                <SelectItem value="BIRTHDAY"> <span className="inline-flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" /> Birthday</span></SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500 mt-1">{meta.hint}</p>
          </div>

          {type === 'POINT' && (
            <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Earn 1 pt every $</Label>
                <Input value={earnPointPerAmount} onChange={e => setEarnPointPerAmount(e.target.value)}
                       inputMode="decimal" className="h-9 mt-1" placeholder="5" />
              </div>
              <div>
                <Label className="text-xs">Redeem cost</Label>
                <Input value={redeemPointCost} onChange={e => setRedeemPointCost(e.target.value)}
                       inputMode="numeric" className="h-9 mt-1" placeholder="100" />
              </div>
              <div>
                <Label className="text-xs">Discount $</Label>
                <Input value={redeemDiscountAmount} onChange={e => setRedeemDiscountAmount(e.target.value)}
                       inputMode="decimal" className="h-9 mt-1" placeholder="5" />
              </div>
            </div>
            {/* Live preview so cashiers understand what the numbers
                actually do — the old "$ per point" label was
                ambiguous and led operators to enter 1 (meaning
                "1 pt per $1") when they wanted 5 (meaning "1 pt
                per $5"). Preview mirrors real earn + redeem math. */}
            {(() => {
              const perAmt = numDec(earnPointPerAmount);
              const cost = num(redeemPointCost);
              const disc = numDec(redeemDiscountAmount);
              if (!perAmt || perAmt <= 0 || !cost || cost <= 0) return null;
              const sample5 = Math.floor(5 / perAmt);
              const sample10 = Math.floor(10 / perAmt);
              const sample50 = Math.floor(50 / perAmt);
              return (
                <div className="text-[10px] text-gray-600 bg-gray-50 border rounded px-2 py-1.5 mt-1 leading-relaxed">
                  <b>Preview:</b>{' '}
                  $5 sale earns <b>{sample5}</b> pt{sample5 === 1 ? '' : 's'}
                  {' · '}
                  $10 → <b>{sample10}</b>
                  {' · '}
                  $50 → <b>{sample50}</b>
                  {disc != null && disc > 0 && (
                    <>. Redeem <b>{cost}</b> pts for <b>${disc}</b> off.</>
                  )}
                </div>
              );
            })()}
            </>
          )}

          {type === 'STAMP' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Buy quantity</Label>
                  <Input value={buyQuantity} onChange={e => setBuyQuantity(e.target.value)}
                         inputMode="numeric" className="h-9 mt-1" placeholder="5" />
                </div>
                <div>
                  <Label className="text-xs">Reward quantity</Label>
                  <Input value={rewardQuantity} onChange={e => setRewardQuantity(e.target.value)}
                         inputMode="numeric" className="h-9 mt-1" placeholder="1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reward item (SKU)</Label>
                <MultiItemPicker value={rewardItemIds} onChange={setRewardItemIds} items={items} />
              </div>
            </>
          )}

          {type === 'BIRTHDAY' && (
            <div>
              <Label className="text-xs">Reward item (SKU)</Label>
              <ItemPicker value={rewardItemId} onChange={setRewardItemId} items={items} />
              <p className="text-[10px] text-gray-500 mt-1">
                Fires on the customer's birth day (checked at POS checkout).
              </p>
            </div>
          )}

          {(type === 'POINT') && (
            <div>
              <Label className="text-xs">Minimum invoice amount (optional)</Label>
              <Input value={minimumAmount} onChange={e => setMinimumAmount(e.target.value)}
                     inputMode="decimal" className="h-9 mt-1" placeholder="0" />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <Switch checked={active} onCheckedChange={setActive} />
            <span>Active</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * v-loyalty-multi-reward-items — multi-select item picker. Selected
 * items render as removable chips above a dropdown of unselected
 * items. Adding an item clears the dropdown so the operator can
 * pick another one immediately.
 */
function MultiItemPicker({ value, onChange, items }: {
  value: string[]; onChange: (v: string[]) => void; items: Item[];
}) {
  const picked = new Set(value);
  const nameById = new Map(items.map(i => [i.id, i.name] as const));
  const remaining = items.filter(i => !picked.has(i.id));

  const add = (id: string) => {
    if (!id || picked.has(id)) return;
    onChange([...value, id]);
  };
  const remove = (id: string) => {
    onChange(value.filter(v => v !== id));
  };

  return (
    <div className="mt-1 space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(id => (
            <span
              key={id}
              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800"
            >
              {nameById.get(id) ?? id.slice(0, 8)}
              <button
                type="button"
                onClick={() => remove(id)}
                className="hover:text-blue-900"
                aria-label="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Select value="" onValueChange={add}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={value.length === 0 ? 'Pick items…' : 'Add another item…'} />
        </SelectTrigger>
        <SelectContent>
          {remaining.map(i => (
            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
          ))}
          {remaining.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-gray-500">
              {items.length === 0 ? 'No items yet.' : 'All items already picked.'}
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Comma-separated list of item names for row rendering. Truncates
 *  after 3 to keep row heights reasonable. */
function itemsLabel(ids: string[] | null | undefined, nameMap: Map<string, string>): string {
  if (!ids || ids.length === 0) return 'item';
  const names = ids.map(id => nameMap.get(id) ?? 'item');
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

/* -------------------- helpers -------------------- */
function str(v: number | string | null | undefined): string {
  if (v == null) return '';
  return String(v);
}
function num(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function numDec(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
