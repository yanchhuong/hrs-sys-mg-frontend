import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import * as settingsApi from '../../api/accountingSettings';

/** Reference lists of taxation patterns. Sale + Purchase share the
 *  original 5-pattern VAT+WHT set; Receipt has its own 4-pattern WHT
 *  catalog matching the form dropdown (datakeys 11 / 15 / 16 / 20). */
const SALE_PURCHASE_TAX_TYPES = [
  { key: '1',  label: 'VAT 10%',                rate: 10 },
  { key: '2',  label: 'VAT 0%',                 rate: 0 },
  { key: '3',  label: 'Exclusive VAT',          rate: 0 },
  { key: '11', label: 'WHT Tax on Service 15%', rate: 15 },
  { key: '12', label: 'WHT Tax on Service 14%', rate: 14 },
];
const RECEIPT_TAX_TYPES = [
  { key: '11', label: 'WHT Tax on Service 15%',                                       rate: 15 },
  { key: '15', label: 'WHT Tax on Rental (Physical Person) 10%',                      rate: 10 },
  { key: '16', label: 'WHT Tax on Rental (Legal Person) 10%',                         rate: 10 },
  { key: '20', label: 'WHT on non-resident (Management fee, Technical Service) 14%',  rate: 14 },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Which side these settings belong to. Drives both the endpoint
   *  the dialog talks to and the labels it renders. */
  scope: settingsApi.AccountingScope;
  /** Fired after a successful save so the parent page can refresh
   *  whatever it cached about the toggles. */
  onSaved?: (next: settingsApi.AccountingSettings) => void;
}

/** "x time ago" formatter — small + dependency-free. Falls back to
 *  the absolute date once we cross a month so the badge doesn't lie
 *  about a year-old timestamp being "x days ago". */
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Per-scope Accountant settings popup. Sale and Purchase each get
 * their own instance (and their own backend row) so toggles and
 * prefixes can diverge — e.g. hide Discount on the Sale form while
 * keeping it on the Bill form. Audit footer shows when and by whom
 * the scope was last updated.
 *
 * <p>Opens with the server-side state, lets the user toggle each
 * flag, then PUTs the lot on Save. Cancel discards in-flight
 * changes — never persists until Save is clicked.</p>
 */
export function AccountingSettingsDialog({ open, onOpenChange, scope, onSaved }: Props) {
  const [draft, setDraft] = useState<settingsApi.AccountingSettings>(() => settingsApi.defaultsFor(scope));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isReceipt = scope === 'receipt';
  const title = scope === 'sale' ? 'Invoice Settings'
              : scope === 'purchase' ? 'Bill Settings'
              : 'Receipt Settings';
  const sideLabel = scope === 'sale' ? 'Invoice'
                  : scope === 'purchase' ? 'Bill'
                  : 'Receipt';
  const prefixLabels = scope === 'sale'
    ? { commercial: 'Invoice', tax: 'Tax Invoice', creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : scope === 'purchase'
    ? { commercial: 'Bill',    tax: 'Tax Bill',    creditNote: 'Credit Note', debitNote: 'Debit Note' }
    : { commercial: 'Receipt', tax: '',            creditNote: '',            debitNote: '' };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    settingsApi.get(scope)
      .then(s => { if (!cancelled) setDraft(s); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, scope]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await settingsApi.update(scope, draft);
      setDraft(saved); // pick up server-stamped updatedAt + updatedByEmail
      toast.success(`${sideLabel} settings saved`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (
    label: string,
    description: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={loading || saving} />
    </div>
  );

  const prefixRow = (
    label: string,
    field: 'prefixCommercial' | 'prefixTax' | 'prefixCreditNote' | 'prefixDebitNote',
  ) => (
    <div className="grid grid-cols-[1fr_120px] items-center gap-3">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Input
        value={draft[field]}
        onChange={e => setDraft({ ...draft, [field]: e.target.value.toUpperCase() })}
        disabled={loading || saving}
        maxLength={16}
        className="font-mono text-sm h-8"
        placeholder={settingsApi.defaultsFor(scope)[field]}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* Description kept for Radix accessibility but hidden —
              the title alone is clear enough and the long paragraph
              clutters the popup. */}
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {toggleRow('Show Notes', 'Internal memo field on the form (not printed).',
            draft.showNotes, v => setDraft({ ...draft, showNotes: v }))}
          {/* Terms / Discount / Tax aren't fields on the Receipt
              form, so hide their toggles for the receipt scope. Tax
              stays as a Receipt-side toggle is meaningless (the whole
              doc IS a tax record) — drop it too. */}
          {!isReceipt && toggleRow('Show Terms & Conditions', 'Customer-facing terms printed at the bottom.',
            draft.showTerms, v => setDraft({ ...draft, showTerms: v }))}
          {!isReceipt && toggleRow('Show Discount', 'Discount input (amount or percent) + line in the totals.',
            draft.showDiscount, v => setDraft({ ...draft, showDiscount: v }))}
          {!isReceipt && toggleRow('Show Tax', 'Taxation dropdown + tax line in the totals.',
            draft.showTax, v => setDraft({ ...draft, showTax: v }))}
        </div>

        <Separator />

        {/* Document-number prefixes — each kind on this side gets its
            own input. Used when auto-generating the next document
            number (<prefix>-<year>-<seq>). Receipt has only one
            document kind, so only the first prefix slot renders. */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Document prefixes</Label>
            <p className="text-xs text-gray-500">
              Drives the auto-generated {sideLabel.toLowerCase()} number on save.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {prefixRow(prefixLabels.commercial, 'prefixCommercial')}
            {!isReceipt && prefixRow(prefixLabels.tax,        'prefixTax')}
            {!isReceipt && prefixRow(prefixLabels.creditNote, 'prefixCreditNote')}
            {!isReceipt && prefixRow(prefixLabels.debitNote,  'prefixDebitNote')}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm font-medium">Tax types</Label>
          <p className="text-xs text-gray-500">
            Click to enable or disable. Disabled patterns won't appear in the Taxation dropdown.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(isReceipt ? RECEIPT_TAX_TYPES : SALE_PURCHASE_TAX_TYPES).map(t => {
              const on = draft.taxTypesEnabled.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={loading || saving}
                  onClick={() => setDraft({
                    ...draft,
                    taxTypesEnabled: on
                      ? draft.taxTypesEnabled.filter(k => k !== t.key)
                      : [...draft.taxTypesEnabled, t.key],
                  })}
                  className={`px-2.5 py-0.5 rounded-full border font-mono text-xs transition-colors ${
                    on
                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      : 'bg-white text-gray-400 border-gray-200 line-through hover:bg-gray-50'
                  }`}
                  title={on ? 'Click to disable' : 'Click to enable'}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Audit footer — server-stamped on every save. Hidden when
            no row exists yet (the popup is showing defaults). */}
        {draft.updatedAt && (
          <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(draft.updatedAt)} ({new Date(draft.updatedAt).toLocaleString()})
            </span>
            {draft.updatedByEmail && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {draft.updatedByEmail}
              </span>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
