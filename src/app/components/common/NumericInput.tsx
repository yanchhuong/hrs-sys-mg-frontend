import React, { forwardRef, useState } from 'react';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { maskNumber } from '../../utils/validation';

/**
 * Common numeric input for money, rates, counts.
 *
 * Behaviour ("focus toggles raw / blur shows format"):
 *   • Focused → shows the raw digit string ("4100" / "1.5") so
 *     cursor-editing behaves normally.
 *   • Blurred → shows the value with an en-US thousand separator
 *     ("4,100" / "1.5") so the number reads at a glance.
 *
 * Every keystroke passes through `mask` — non-digits and duplicate
 * dots are stripped BEFORE the parent's onChange fires. That means
 * a paste like "41yhjhjhjhj00" lands as "4100" and typos never
 * pollute state. `inputMode="decimal"` opens the numeric keypad on
 * phones without forcing type="number" (which brings its own quirks
 * like unwanted spinner buttons and locale-sensitive parsing).
 *
 * Right-aligned + `tabular-nums` by default — matches the "numeric
 * right-align" convention already used across the app (Invoice /
 * Quotation summary cards etc.). Pass className to override.
 *
 * @param value    Controlled state as a plain digit string. Empty
 *                 string is a valid state (placeholder shows).
 * @param onChange Called with the masked value (still a string, so
 *                 the caller can round-trip it back through JSON /
 *                 backend without a Number() conversion).
 * @param decimals How many fractional digits to preserve. 0 = integer
 *                 (Qty), 2 = money (Unit price, Discount, Total),
 *                 4 = exchange rate / high-precision tariff. Default 2.
 */
interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (rawDigits: string) => void;
  decimals?: number;
  /** Max integer digits (numeric(p,s) → p − s). Defaults to 10 for
   *  4-decimal fields (numeric(14,4)) and 12 otherwise (numeric(14,2)),
   *  so a typo can't overflow the column and come back as a 409. */
  maxInt?: number;
  className?: string;
}

/** Digit-only masker — the shared one in utils/validation. */
function mask(raw: string, decimals: number, maxInt: number): string {
  return maskNumber(raw, { int: maxInt, dec: decimals });
}

/** "4100" → "4,100"; "1.5" → "1.5"; "" → "".
 *  Uses toLocaleString for clean thousand separators; falls back to
 *  the raw string when input isn't a finite number. */
function formatWithCommas(raw: string, decimals: number): string {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (!isFinite(n)) return raw;
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, decimals = 2, maxInt, className, onFocus, onBlur, ...rest }, ref) => {
    const intCap = maxInt ?? (decimals >= 4 ? 10 : 12);
    const [focused, setFocused] = useState(false);
    return (
      <Input
        ref={ref}
        inputMode="decimal"
        value={focused ? value : formatWithCommas(value, decimals)}
        onChange={e => onChange(mask(e.target.value, decimals, intCap))}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        className={cn('tabular-nums text-right', className)}
        {...rest}
      />
    );
  },
);

NumericInput.displayName = 'NumericInput';
