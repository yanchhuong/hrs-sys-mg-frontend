/**
 * V362 — Spin & Win prize helpers shared by the wheel editor, the public
 * wheel and the POS checkout.
 */
import type { PrizeKind } from '../api/shop';

export const PRIZE_KINDS: { key: PrizeKind; label: string }[] = [
  { key: 'percent', label: '% off' },
  { key: 'amount', label: '$ off' },
  { key: 'gift', label: 'Gift' },
  { key: 'none', label: 'Try again' },
];

/** The coupon validity choices the owner can pick (0 = no expiry). */
export const COUPON_DAY_CHOICES = [0, 1, 2, 3, 7] as const;

export function couponDaysLabel(days: number | null | undefined): string {
  if (!days) return 'No expiry';
  return days === 1 ? '1 day' : `${days} days`;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

/** The label a slice gets from its type and value — "10% off", "$2 off".
 *  Null for gift / none, whose label the owner writes. */
export function autoLabel(kind: PrizeKind | null | undefined, value: number | null | undefined): string | null {
  if (kind === 'percent' && value) return `${num(value)}% off`;
  if (kind === 'amount' && value) return `$${num(value)} off`;
  if (kind === 'none') return 'Try again';
  return null;
}

/** The discount a coupon gives at checkout, from its prize type — or, for
 *  coupons won before V362, read from a "10% off" / "$2 off" label. */
export function couponDiscount(c: { prizeKind?: PrizeKind | null; prizeValue?: number | null; label: string }):
  { type: 'percent' | 'amount'; value: number; text: string } | null {
  if (c.prizeKind === 'percent' && c.prizeValue) return { type: 'percent', value: Number(c.prizeValue), text: `${num(Number(c.prizeValue))}%` };
  if (c.prizeKind === 'amount' && c.prizeValue) return { type: 'amount', value: Number(c.prizeValue), text: `$${num(Number(c.prizeValue))}` };
  if (c.prizeKind) return null;
  const pct = c.label.match(/(\d+(?:\.\d+)?)\s*%\s*off/i);
  if (pct) return { type: 'percent', value: Number(pct[1]), text: `${pct[1]}%` };
  const amt = c.label.match(/\$\s*(\d+(?:\.\d+)?)\s*off/i);
  if (amt) return { type: 'amount', value: Number(amt[1]), text: `$${amt[1]}` };
  return null;
}

/** "Fri 17 Oct, 14:05" in the viewer's locale. */
export function fmtExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
