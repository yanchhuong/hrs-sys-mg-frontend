/**
 * V-library-membership-renewal — one-shot renewal popup.
 *
 * <p>Picks a membership type (auto-fills price + duration), captures
 * payment method + reference dates, and calls the BE renewal endpoint
 * which spawns an invoice + payment (both marked paid) and stamps the
 * member's effective + expiry dates. The full flow commits atomically
 * on the BE — a failure at any step aborts everything.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '../../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import * as library from '../../../api/library';
import { format } from 'date-fns';
import { DateInput } from '../../common/DateInput';
import { NumericInput } from '../../common/NumericInput';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: library.Member | null;
  onRenewed?: (m: library.Member) => void;
}

type Method = 'cash' | 'bank' | 'card' | 'cheque' | 'khqr' | 'other';
type Currency = 'USD' | 'KHR';

interface FormState {
  membershipType: string;
  amount: string;
  currency: Currency;
  method: Method;
  paymentDate: string;
  effectiveDate: string;
  expiryDate: string;
  notes: string;
}

// Local-date "today" — toISOString() is UTC and gave yesterday's date
// before 07:00 in Phnom Penh (UTC+7).
const todayIso = () => format(new Date(), 'yyyy-MM-dd');

/** Add `days` to an ISO date string, returning ISO. Null-safe.
 *  Parses and formats in local time — the old toISOString() round-trip
 *  shifted the expiry one day early in UTC+ zones. */
function addDays(dateIso: string | undefined, days: number | null | undefined): string {
  if (!dateIso || days == null) return '';
  const d = new Date(dateIso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}

export function RenewMembershipDialog({ open, onOpenChange, member, onRenewed }: Props) {
  const [types, setTypes] = useState<library.MembershipType[]>([]);
  const [form, setForm] = useState<FormState>({
    membershipType: '',
    amount: '0',
    currency: 'USD',
    method: 'cash',
    paymentDate: todayIso(),
    effectiveDate: todayIso(),
    expiryDate: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ membershipType?: string; effectiveDate?: string }>({});

  // Load types when the dialog opens; seed form defaults from the
  // member's current tier if we have one.
  useEffect(() => {
    if (!open || !member) return;
    (async () => {
      const ts = await library.membershipTypes.list().catch(() => [] as library.MembershipType[]);
      setTypes(ts);
      const currentType = member.membershipType ?? '';
      const matched = ts.find(t => t.name === currentType);
      const start = todayIso();
      setErrors({});
      setForm({
        membershipType: currentType,
        amount: matched ? String(matched.price) : '0',
        currency: (matched?.currency as Currency) ?? 'USD',
        method: 'cash',
        paymentDate: start,
        effectiveDate: start,
        expiryDate: matched?.durationDays ? addDays(start, matched.durationDays) : (member.expiryDate ?? ''),
        notes: '',
      });
    })();
  }, [open, member]);

  const activeTypes = useMemo(() => types.filter(t => t.active || t.name === form.membershipType), [types, form.membershipType]);

  const pickType = (name: string) => {
    const t = types.find(x => x.name === name);
    if (name.trim()) setErrors(prev => ({ ...prev, membershipType: undefined }));
    setForm(prev => ({
      ...prev,
      membershipType: name,
      // Only overwrite the amount + currency + expiry if the tier is
      // known and priced. If the tenant has legacy free-text tiers
      // sitting in the picker, don't clobber the operator's numbers.
      amount:      t ? String(t.price) : prev.amount,
      currency:    t ? ((t.currency as Currency) ?? prev.currency) : prev.currency,
      expiryDate:  t?.durationDays ? addDays(prev.effectiveDate, t.durationDays) : prev.expiryDate,
    }));
  };

  const recalcExpiry = (nextEffective: string) => {
    const t = types.find(x => x.name === form.membershipType);
    setForm(prev => ({
      ...prev,
      effectiveDate: nextEffective,
      expiryDate: t?.durationDays ? addDays(nextEffective, t.durationDays) : prev.expiryDate,
    }));
  };

  const submit = async () => {
    if (!member) return;
    const nextErrors: { membershipType?: string; effectiveDate?: string } = {};
    if (!form.membershipType.trim()) nextErrors.membershipType = 'Membership type is required';
    if (!form.effectiveDate) nextErrors.effectiveDate = 'Effective date is required';
    setErrors(nextErrors);
    if (nextErrors.membershipType || nextErrors.effectiveDate) {
      toast.error(nextErrors.membershipType ?? nextErrors.effectiveDate!);
      return;
    }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error('Amount must be greater than zero'); return; }
    setSaving(true);
    try {
      const updated = await library.members.renew(member.id, {
        membershipType: form.membershipType.trim(),
        amount: amt,
        currency: form.currency,
        method: form.method,
        paymentDate: form.paymentDate || undefined,
        effectiveDate: form.effectiveDate || undefined,
        expiryDate: form.expiryDate || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Membership renewed');
      onOpenChange(false);
      onRenewed?.(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Renewal failed');
    } finally { setSaving(false); }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
            Renew Membership
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{member.name}</span>
            {member.memberNo && <span className="text-gray-500 font-mono"> · {member.memberNo}</span>}
            {member.membershipType && <span className="text-gray-500"> · currently {member.membershipType}</span>}
            <br />
            Confirming spawns an invoice + payment (marked paid), then rolls the effective + expiry dates forward.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Membership Type <span className="text-red-500">*</span></Label>
            {activeTypes.length > 0 ? (
              <Select value={form.membershipType} onValueChange={pickType}>
                <SelectTrigger aria-invalid={!!errors.membershipType}
                               className={errors.membershipType ? 'border-red-500' : undefined}>
                  <SelectValue placeholder="Pick a tier" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map(t => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}{t.price > 0 ? ` — ${t.currency} ${Number(t.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}{t.durationDays ? ` · ${t.durationDays}d` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Free-form tier label"
                     aria-invalid={!!errors.membershipType}
                     className={errors.membershipType ? 'border-red-500' : undefined}
                     value={form.membershipType}
                     onChange={e => {
                       const v = e.target.value;
                       if (v.trim()) setErrors(prev => ({ ...prev, membershipType: undefined }));
                       setForm({ ...form, membershipType: v });
                     }} />
            )}
            {errors.membershipType && <p className="text-xs text-red-600">{errors.membershipType}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Amount <span className="text-red-500">*</span></Label>
            <NumericInput decimals={form.currency === 'KHR' ? 0 : 2} value={form.amount}
                          onChange={v => setForm({ ...form, amount: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v as Currency })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KHR">KHR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={form.method} onValueChange={v => setForm({ ...form, method: v as Method })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="khqr">KHQR</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Date</Label>
            <DateInput className="w-full" value={form.paymentDate || null}
                       onChange={v => setForm({ ...form, paymentDate: v ?? '' })} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective Date <span className="text-red-500">*</span></Label>
            <DateInput className={`w-full ${errors.effectiveDate ? 'border-red-500' : ''}`}
                       value={form.effectiveDate || null}
                       onChange={v => {
                         if (v) setErrors(prev => ({ ...prev, effectiveDate: undefined }));
                         recalcExpiry(v ?? '');
                       }} />
            {errors.effectiveDate && <p className="text-xs text-red-600">{errors.effectiveDate}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <DateInput className="w-full" value={form.expiryDate || null}
                       min={form.effectiveDate || undefined}
                       onChange={v => setForm({ ...form, expiryDate: v ?? '' })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit()} disabled={saving}>
            {saving ? 'Renewing…' : 'Confirm Renewal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
