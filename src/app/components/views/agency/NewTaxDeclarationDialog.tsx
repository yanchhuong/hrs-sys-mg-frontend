import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Plus } from 'lucide-react';
import * as declApi from '../../../api/agencyTaxDecl';
import { useAgencyClient } from '../../../context/AgencyClientContext';

/** The nine seeded obligations from V225. Kept in the FE for the
 *  picker; a smarter version would fetch the reference list, but
 *  MVP hard-codes since the set is Cambodian statute and rarely
 *  changes. */
const OBLIGATION_CHOICES: Array<{ code: string; name: string; frequency: 'monthly' | 'annual' }> = [
  { code: 'tos_monthly',           name: 'Monthly Tax on Salary (TOS)',        frequency: 'monthly' },
  { code: 'ptoi_monthly',          name: 'Prepayment of Tax on Income (PToI)', frequency: 'monthly' },
  { code: 'vat_monthly',           name: 'VAT return',                          frequency: 'monthly' },
  { code: 'wht_monthly',           name: 'Withholding Tax',                     frequency: 'monthly' },
  { code: 'specific_tax_monthly',  name: 'Specific Tax',                        frequency: 'monthly' },
  { code: 'nssf_monthly',          name: 'NSSF contribution',                   frequency: 'monthly' },
  { code: 'patent_annual',         name: 'Patent Tax',                          frequency: 'annual' },
  { code: 'income_tax_annual',     name: 'Tax on Income (annual)',              frequency: 'annual' },
  { code: 'financial_statements',  name: 'Financial statements',                frequency: 'annual' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTenantId?: string | null;
  onCreated?: () => void;
}

export function NewTaxDeclarationDialog({ open, onOpenChange, defaultTenantId, onCreated }: Props) {
  const { portfolio } = useAgencyClient();

  const [tenantId, setTenantId] = useState<string>('');
  const [obligationCode, setObligationCode] = useState<string>('tos_monthly');
  const [period, setPeriod] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState('KHR');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTenantId(defaultTenantId ?? '');
    setObligationCode('tos_monthly');
    setPeriod('');
    setAmount('');
    setCurrency('KHR');
    setNotes('');
  }, [open, defaultTenantId]);

  const chosen = OBLIGATION_CHOICES.find(o => o.code === obligationCode);
  const periodHint = chosen?.frequency === 'monthly'
    ? 'YYYY-MM (e.g. 2026-01)'
    : 'YYYY (e.g. 2025)';

  const submit = async () => {
    if (!tenantId || !obligationCode || !period.trim()) return;
    setSaving(true);
    try {
      await declApi.agency.create({
        tenantId,
        obligationCode,
        period: period.trim(),
        amountOwed: amount ? parseFloat(amount) : 0,
        currency: currency || 'KHR',
        notes: notes.trim() || null,
      });
      toast.success('Draft created');
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New tax declaration</DialogTitle>
          <DialogDescription>
            Starts in <b>draft</b>. You'll be the preparer; the four-eyes chain
            (reviewer → partner) kicks in when you send it up for review. On
            <b> submit-to-GDT</b> the paired Tax Calendar row is auto-marked filed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Client</div>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick a client…" /></SelectTrigger>
                <SelectContent>
                  {portfolio.map(c => (
                    <SelectItem key={c.tenantId} value={c.tenantId}>
                      {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Obligation</div>
              <Select value={obligationCode} onValueChange={setObligationCode}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBLIGATION_CHOICES.map(o => (
                    <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs col-span-1">
              <div className="text-gray-500 mb-1">Period</div>
              <Input
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder={periodHint}
                className="h-9 text-sm"
                maxLength={7}
              />
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Amount owed</div>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 text-sm text-right tabular-nums"
              />
            </label>
            <label className="text-xs">
              <div className="text-gray-500 mb-1">Currency</div>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KHR">KHR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="text-sm mt-1"
              placeholder="Brief for the reviewer — calculation basis, adjustments, sources."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !tenantId || !obligationCode || !period.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
