import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Coins, Save, Loader2 } from 'lucide-react';
import * as currencyApi from '../../api/currencySettings';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fired after a successful save so parents can refresh any
   *  cached currency list. */
  onSaved?: (next: currencyApi.CurrencySettings) => void;
}

/**
 * Tenant-wide currency picker (V166). One row per tenant — picks
 * up to two ISO-4217 currencies plus the conversion rate between
 * them. Drives every form's currency dropdown app-wide.
 */
export function CurrencySettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [primary, setPrimary] = useState<currencyApi.AllowedCurrency>('USD');
  /** Empty string in the picker = "None" (single-currency tenant). */
  const [secondary, setSecondary] = useState<'' | currencyApi.AllowedCurrency>('KHR');
  const [rate, setRate] = useState<string>('4100');

  // Re-fetch on every open so a settings change made elsewhere is
  // reflected immediately.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    currencyApi.get()
      .then(s => {
        setPrimary(s.primaryCurrency);
        setSecondary(s.secondaryCurrency ?? '');
        setRate(s.secondaryRate != null ? String(s.secondaryRate) : '');
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load currency settings'))
      .finally(() => setLoading(false));
  }, [open]);

  // When primary flips to the value currently in secondary, blank
  // the secondary so the operator can't end up with primary ==
  // secondary visually (server rejects this too, but clearing
  // up front is friendlier).
  useEffect(() => {
    if (secondary && secondary === primary) {
      setSecondary('');
      setRate('');
    }
  }, [primary, secondary]);

  const submit = async () => {
    if (saving) return;
    const sec = secondary === '' ? null : secondary;
    const parsedRate = rate.trim() === '' ? null : Number(rate);
    if (sec && (parsedRate === null || !Number.isFinite(parsedRate) || parsedRate <= 0)) {
      toast.error('Enter a positive conversion rate, or remove the secondary currency.');
      return;
    }
    setSaving(true);
    try {
      const next = await currencyApi.save({
        primaryCurrency: primary,
        secondaryCurrency: sec,
        secondaryRate: sec ? parsedRate : null,
      });
      toast.success('Currency settings saved');
      onSaved?.(next);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save currency settings');
    } finally {
      setSaving(false);
    }
  };

  // Secondary options exclude whatever the primary is — a tenant
  // can't pair USD with USD. "None" is also offered so a single-
  // currency tenant (e.g. KRW-only) can opt out of pairing.
  const secondaryOptions = currencyApi.ALLOWED_CURRENCIES.filter(c => c !== primary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-600" />
            Currency settings
          </DialogTitle>
          <DialogDescription>
            Pick the currencies this tenant transacts in. Drives every Invoice / POS / Quotation / Voucher form
            and totals on receipts. It is Max two currencies.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Primary currency</Label>
                <Select value={primary} onValueChange={v => setPrimary(v as currencyApi.AllowedCurrency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyApi.ALLOWED_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Secondary (optional)</Label>
                <Select
                  value={secondary === '' ? '__none' : secondary}
                  onValueChange={v => {
                    const next = v === '__none' ? '' : v as currencyApi.AllowedCurrency;
                    setSecondary(next);
                    // Picking "None" makes the rate meaningless — clear
                    // it inline so the guard on Save can't misfire
                    // against a stale value.
                    if (!next) setRate('');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None — single currency</SelectItem>
                    {secondaryOptions.map(c => (
                      <SelectItem key={c} value={c}>{currencyApi.currencyLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {secondary && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">
                  Conversion rate ({primary} → {secondary})
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  placeholder={primary === 'USD' && secondary === 'KHR' ? '4100' : 'e.g. 1300'}
                />
                <p className="text-[11px] text-gray-500">
                  1 {primary} = <span className="tabular-nums font-medium">{rate || '—'}</span> {secondary}.
                  Used for the second total line on POS receipts and the Grand Total ({secondary}) row on invoices.
                </p>
              </div>
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
              Changing the pair affects new documents only — existing
              Invoice / POS / Quotation / Voucher rows keep the currency
              and exchange rate they were saved with.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
