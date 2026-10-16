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

/* ---------------------------------------------------------------------------
 * Wheel colours — every slice its own colour, never a repeat.
 *
 * Twelve clearly different colours (the wheel allows up to 12 slices),
 * listed in hue order. The order on the wheel is mixed per shop — seeded
 * by the shop code + slice labels, so a shop's wheel looks the same on
 * every visit — and each next slice takes the unused colour furthest
 * round the hue circle from its neighbour (and, for the last, from the
 * first), so neighbours never look alike.
 * ------------------------------------------------------------------------- */
const WHEEL_PALETTE: { bg: string; dark: boolean }[] = [
  { bg: '#E11D48', dark: false }, // red
  { bg: '#F97316', dark: false }, // orange
  { bg: '#FBBF24', dark: true },  // amber
  { bg: '#84CC16', dark: true },  // lime
  { bg: '#16A34A', dark: false }, // green
  { bg: '#0D9488', dark: false }, // teal
  { bg: '#22D3EE', dark: true },  // cyan
  { bg: '#2563EB', dark: false }, // blue
  { bg: '#4F46E5', dark: false }, // indigo
  { bg: '#9333EA', dark: false }, // purple
  { bg: '#EC4899', dark: false }, // pink
  { bg: '#92400E', dark: false }, // brown
];

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distinct fill + readable text colour for each of n slices. Tries a
 *  few dozen arrangements and keeps the one whose closest neighbours
 *  (including last ↔ first) are furthest apart round the hue circle. */
export function wheelColors(n: number, seed: string): { fill: string; text: string }[] {
  const P = WHEEL_PALETTE.length;
  const rnd = seededRandom(seed);
  const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % P; return Math.min(d, P - d); };
  const worstGap = (o: number[]) =>
    o.length < 2 ? P : Math.min(...o.map((k, i) => (i === o.length - 1 && o.length === 2 ? P : hueGap(k, o[(i + 1) % o.length]))));
  let best: number[] = [];
  const consider = (o: number[]) => { if (!best.length || worstGap(o) > worstGap(best)) best = o; };
  // Stepping 5 (or 7) colours round the hue circle each slice — every
  // neighbour far apart; perfect for a full wheel. Start colour is random.
  const start = Math.floor(rnd() * P);
  for (const step of rnd() < 0.5 ? [5, 7] : [7, 5]) {
    consider(Array.from({ length: Math.min(n, P) }, (_, i) => (start + i * step) % P));
  }
  for (let attempt = 0; attempt < 40; attempt++) consider(arrange(n, P, rnd, hueGap));
  return best.map(k => ({ fill: WHEEL_PALETTE[k].bg, text: WHEEL_PALETTE[k].dark ? '#1F2937' : '#FFFFFF' }));
}

/** One greedy arrangement: a random first colour, then each next slice
 *  takes the unused colour furthest from its neighbour(s). */
function arrange(n: number, P: number, rnd: () => number, hueGap: (a: number, b: number) => number): number[] {
  const used = new Set<number>();
  const order: number[] = [];
  for (let i = 0; i < Math.min(n, P); i++) {
    const free = [...Array(P).keys()].filter(k => !used.has(k));
    let pick: number;
    if (i === 0) {
      pick = free[Math.floor(rnd() * free.length)];
    } else {
      // Score each free colour once: hue distance from the previous slice
      // (and, for the last slice, from the first), plus a little chance
      // to choose among equally good ones.
      const scored = free.map(k => {
        const prev = hueGap(k, order[i - 1]);
        const wrap = i === n - 1 && n > 2 ? hueGap(k, order[0]) : P;
        return { k, score: Math.min(prev, wrap) + rnd() * 0.5 };
      });
      pick = scored.reduce((best, c) => (c.score > best.score ? c : best)).k;
    }
    used.add(pick);
    order.push(pick);
  }
  // More slices than colours can't happen (max 12), but stay safe.
  while (order.length < n) order.push(order[order.length % P]);
  return order;
}
