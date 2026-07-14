import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2, Plus, Paperclip } from 'lucide-react';
import * as declApi from '../../../api/agencyTaxDecl';
import type { TaxDeclCategory, LinkedDoc } from '../../../api/agencyTaxDecl';
import { useAgencyClient } from '../../../context/AgencyClientContext';

/**
 * The nine seeded obligations from V225, bucketed into the FE's
 * five categories per v-tax-decl-category-and-docs. Same mapping
 * as BE's OBLIGATION_TO_CATEGORY — keep them aligned.
 */
const OBLIGATION_CHOICES: Array<{
  code: string; name: string; frequency: 'monthly' | 'annual'; category: TaxDeclCategory;
}> = [
  { code: 'ptoi_monthly',          name: 'Prepayment of Tax on Income (PToI)', frequency: 'monthly', category: 'income' },
  { code: 'vat_monthly',           name: 'VAT return',                          frequency: 'monthly', category: 'expense' },
  { code: 'specific_tax_monthly',  name: 'Specific Tax',                        frequency: 'monthly', category: 'expense' },
  { code: 'tos_monthly',           name: 'Monthly Tax on Salary (TOS)',        frequency: 'monthly', category: 'salary' },
  { code: 'wht_monthly',           name: 'Withholding Tax',                     frequency: 'monthly', category: 'wht' },
  { code: 'nssf_monthly',          name: 'NSSF contribution',                   frequency: 'monthly', category: 'nssf' },
  { code: 'income_tax_annual',     name: 'Tax on Income (annual)',              frequency: 'annual',  category: 'income' },
  { code: 'patent_annual',         name: 'Patent Tax',                          frequency: 'annual',  category: 'expense' },
  { code: 'financial_statements',  name: 'Financial statements',                frequency: 'annual',  category: 'expense' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTenantId?: string | null;
  /** Frequency of the parent Monthly/Yearly tab — pre-selects an
   *  obligation of that frequency so the picker starts on the
   *  right shape. */
  defaultFrequency?: 'monthly' | 'annual';
  onCreated?: () => void;
}

const CURRENT_MONTH_ISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const CURRENT_YEAR_ISO = () => String(new Date().getFullYear());

export function NewTaxDeclarationDialog({
  open, onOpenChange, defaultTenantId, defaultFrequency = 'monthly', onCreated,
}: Props) {
  const { portfolio } = useAgencyClient();

  const defaultCode = defaultFrequency === 'annual' ? 'income_tax_annual' : 'ptoi_monthly';

  const [tenantId, setTenantId] = useState<string>('');
  const [obligationCode, setObligationCode] = useState<string>(defaultCode);
  const [period, setPeriod] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState('KHR');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // v-tax-decl-category-and-docs — candidates + user's picks
  const [suggested, setSuggested] = useState<LinkedDoc[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const chosen = OBLIGATION_CHOICES.find(o => o.code === obligationCode);
  const chosenCategory: TaxDeclCategory = chosen?.category ?? 'income';
  const isMonthly = chosen?.frequency !== 'annual';
  const periodHint = isMonthly ? 'MM-YYYY (e.g. 07-2026)' : 'YYYY (e.g. 2026)';
  const linkableCategory = chosenCategory === 'income' || chosenCategory === 'expense';

  useEffect(() => {
    if (!open) return;
    setTenantId(defaultTenantId ?? '');
    setObligationCode(defaultCode);
    // Prefill period so the user rarely has to type it. Monthly
    // gets the current month; yearly gets the current year.
    setPeriod(defaultFrequency === 'annual'
      ? CURRENT_YEAR_ISO()
      : monthDisplayFromIso(CURRENT_MONTH_ISO()));
    setAmount('');
    setCurrency('KHR');
    setNotes('');
    setSuggested([]);
    setPicked(new Set());
  }, [open, defaultTenantId, defaultCode, defaultFrequency]);

  // When obligation flips between frequencies, resync the period
  // prefill so it never carries a mismatched shape into save.
  useEffect(() => {
    if (!open) return;
    setPeriod(isMonthly ? monthDisplayFromIso(CURRENT_MONTH_ISO()) : CURRENT_YEAR_ISO());
  }, [open, obligationCode, isMonthly]);

  // Auto-suggest source docs when (tenant, category, period) are
  // known AND the category is linkable (income / expense). Salary
  // / WHT / NSSF have no doc-source in this design so we skip.
  useEffect(() => {
    if (!open) return;
    const isoPeriod = normalizePeriodToIso(period, isMonthly);
    if (!tenantId || !linkableCategory || !isoPeriod) {
      setSuggested([]);
      setPicked(new Set());
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    declApi.agency.suggestDocs(tenantId, chosenCategory, isoPeriod)
      .then(list => {
        if (cancelled) return;
        setSuggested(list);
        // Auto-tick every suggested doc — the user unchecks to
        // exclude. Matches the "auto-suggest + manual override"
        // answer from setup.
        setPicked(new Set(list.map(d => d.docId)));
      })
      .catch(() => { if (!cancelled) { setSuggested([]); setPicked(new Set()); } })
      .finally(() => { if (!cancelled) setSuggestLoading(false); });
    return () => { cancelled = true; };
  }, [open, tenantId, chosenCategory, period, isMonthly, linkableCategory]);

  const linkedDocsSubtotal = useMemo(() => {
    let sum = 0;
    for (const d of suggested) if (picked.has(d.docId)) sum += Number(d.docAmount ?? 0);
    return sum;
  }, [suggested, picked]);

  const submit = async () => {
    if (!tenantId || !obligationCode || !period.trim()) return;
    const isoPeriod = normalizePeriodToIso(period, isMonthly);
    if (!isoPeriod) {
      toast.error(isMonthly ? 'Period must look like MM-YYYY' : 'Period must be a 4-digit year');
      return;
    }
    setSaving(true);
    try {
      const linkedDocs = linkableCategory
        ? suggested
            .filter(d => picked.has(d.docId))
            .map(d => ({ docType: d.docType, docId: d.docId }))
        : [];
      await declApi.agency.create({
        tenantId,
        obligationCode,
        period: isoPeriod,
        category: chosenCategory,
        amountOwed: amount ? parseFloat(amount) : 0,
        currency: currency || 'KHR',
        notes: notes.trim() || null,
        linkedDocs,
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

  const canSubmit = !!tenantId && !!obligationCode && !!period.trim() && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>New tax declaration</DialogTitle>
          <DialogDescription>
            Starts in <b>draft</b>. Attach the source Invoices / Bills / Expenses
            below; the reviewer chain kicks in when you send it up. On <b>submit-to-GDT</b>
            the Tax Calendar row auto-flips to filed.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-3">
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
                  {OBLIGATION_CHOICES
                    // Pin the picker to the same frequency as the
                    // parent tab — Monthly obligations under
                    // Monthly, annual under Yearly. User can flip
                    // manually if they want.
                    .filter(o => o.frequency === (defaultFrequency ?? 'monthly') || o.code === obligationCode)
                    .map(o => (
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
                className="h-9 text-sm tabular-nums"
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

          {/* Attach source docs — auto-suggested for income / expense
              categories on a valid (tenant, period). Empty otherwise. */}
          {linkableCategory && (
            <div>
              <Label className="text-xs inline-flex items-center gap-1.5">
                <Paperclip className="h-3 w-3" />
                Source {chosenCategory === 'income' ? 'invoices' : 'bills + expenses'}
                {suggestLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </Label>
              <div className="mt-1 border rounded-md max-h-56 overflow-y-auto">
                {!tenantId ? (
                  <p className="text-[11px] text-gray-500 px-3 py-2">
                    Pick a client to see candidate documents.
                  </p>
                ) : suggested.length === 0 ? (
                  <p className="text-[11px] text-gray-500 px-3 py-2">
                    {suggestLoading
                      ? 'Loading…'
                      : `No ${chosenCategory === 'income' ? 'invoices' : 'bills or expenses'} on that Company for this period.`}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {suggested.map(d => {
                      const on = picked.has(d.docId);
                      return (
                        <li key={`${d.docType}:${d.docId}`}>
                          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={e => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(d.docId); else next.delete(d.docId);
                                setPicked(next);
                              }}
                            />
                            <span className="text-xs uppercase text-gray-500 w-16 shrink-0">{d.docType}</span>
                            <span className="text-sm font-medium tabular-nums flex-1 truncate">{d.docNo}</span>
                            <span className="text-xs tabular-nums text-gray-600">
                              {Number(d.docAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {suggested.length > 0 && (
                <div className="text-[11px] text-gray-500 mt-1 tabular-nums text-right">
                  {picked.size} of {suggested.length} attached · subtotal {linkedDocsSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}

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

        <DialogFooter className="px-6 py-3 border-t bg-gray-50 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Accept both storage (YYYY-MM) and display (MM-YYYY) shapes on
 *  input; return null when neither matches the current frequency. */
function normalizePeriodToIso(input: string, monthly: boolean): string | null {
  const t = input.trim();
  if (monthly) {
    // MM-YYYY (display) — swap to YYYY-MM
    let m = t.match(/^([0-1]?\d)-(\d{4})$/);
    if (m) {
      const mm = m[1].padStart(2, '0');
      const mi = parseInt(mm, 10);
      if (mi >= 1 && mi <= 12) return `${m[2]}-${mm}`;
    }
    // YYYY-MM (already ISO)
    m = t.match(/^(\d{4})-([0-1]?\d)$/);
    if (m) {
      const mm = m[2].padStart(2, '0');
      const mi = parseInt(mm, 10);
      if (mi >= 1 && mi <= 12) return `${m[1]}-${mm}`;
    }
    return null;
  }
  return /^\d{4}$/.test(t) ? t : null;
}

/** Format a YYYY-MM ISO period as MM-YYYY for display in the
 *  monthly input. */
function monthDisplayFromIso(iso: string): string {
  if (iso.length === 7 && iso.charAt(4) === '-') {
    return iso.substring(5) + '-' + iso.substring(0, 4);
  }
  return iso;
}
