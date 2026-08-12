import { useEffect, useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';

/**
 * Denomination calculator popup. Splits an amount into the greedy
 * count of each note using per-currency denomination tables. No API,
 * no persistence — the parent opens this with a default amount (e.g.
 * the payslip's net salary) and closes it when the operator is done.
 */
type Currency = 'USD' | 'KHR';

const DENOMS: Record<Currency, number[]> = {
  USD: [100, 50, 20, 10, 5, 1],
  KHR: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100],
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Initial amount pre-filled into the input. */
  defaultAmount?: number;
  /** Initial currency selection. */
  defaultCurrency?: Currency;
}

export function CashCountDialog({
  open, onOpenChange, defaultAmount = 0, defaultCurrency = 'USD',
}: Props) {
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [amountInput, setAmountInput] = useState<string>(
    defaultAmount.toFixed(defaultCurrency === 'USD' ? 2 : 0),
  );

  // Re-seed on open so re-opening the dialog from a different payslip
  // starts at that slip's net rather than the previous one's number.
  useEffect(() => {
    if (!open) return;
    setCurrency(defaultCurrency);
    setAmountInput(defaultAmount.toFixed(defaultCurrency === 'USD' ? 2 : 0));
  }, [open, defaultAmount, defaultCurrency]);

  const rows = useMemo(() => {
    const amt = Number(amountInput);
    if (!Number.isFinite(amt) || amt <= 0) {
      return DENOMS[currency].map(d => ({ denom: d, qty: 0, amount: 0 }));
    }
    // Work in whole minor units so 0.10 + 0.20 doesn't become 0.30000004
    // and eat a cent. USD keeps two decimals → cents; KHR is whole riel.
    const factor = currency === 'USD' ? 100 : 1;
    let remainder = Math.round(amt * factor);
    return DENOMS[currency].map(d => {
      const dm = Math.round(d * factor);
      const qty = Math.floor(remainder / dm);
      remainder -= qty * dm;
      return { denom: d, qty, amount: qty * d };
    });
  }, [amountInput, currency]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const symbol = currency === 'USD' ? '$' : '៛';
  const fmt = (n: number) => currency === 'USD'
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600" />
            Money Count
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Amount</Label>
            <Input
              type="number"
              step={currency === 'USD' ? '0.01' : '1'}
              min={0}
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Currency</Label>
            <Select value={currency} onValueChange={v => setCurrency(v as Currency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KHR">KHR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-md divide-y">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50">
            <span>Denomination</span>
            <span className="text-center min-w-[64px]">Quantity</span>
            <span className="text-right">Amount</span>
          </div>
          {rows.map(r => {
            // Rows with qty > 0 pick up a soft emerald tint so the
            // operator can eye-scan the active denominations. Zero
            // rows stay muted grey to read as "skip this row". No
            // left accent — the tint alone is enough signal.
            const active = r.qty > 0;
            return (
              <div
                key={r.denom}
                className={`grid grid-cols-[1fr_auto_1fr] gap-4 px-3 py-1.5 text-sm tabular-nums transition-colors ${
                  active ? 'bg-emerald-50/40 text-emerald-900' : 'text-gray-400'
                }`}
              >
                <span>{symbol}{fmt(r.denom)}</span>
                <span className={`text-center min-w-[64px] ${active ? 'font-semibold' : ''}`}>{r.qty}</span>
                <span className="text-right">{symbol}{fmt(r.amount)}</span>
              </div>
            );
          })}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-3 py-2 text-sm font-semibold bg-gray-50">
            <span>Total</span>
            <span className="min-w-[64px]" />
            <span className="text-right tabular-nums">{symbol}{fmt(total)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
