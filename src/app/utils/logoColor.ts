/**
 * v-footer-logo-tint — pick a footer-band colour out of the company
 * logo.
 *
 * Split from the DOM so the awkward part — deciding which pixel of a
 * logo is "the brand colour" — can be run and checked on its own.
 * Nothing here touches canvas or window.
 *
 * The naive version of this (average every pixel) returns mud: logos
 * are mostly white background and black text, so the mean of a bright
 * orange mark on white is a pale grey. The rules below exist to get
 * the orange instead.
 */

export interface Rgb { r: number; g: number; b: number }

/** Below this alpha a pixel is logo transparency, not colour. */
const MIN_ALPHA = 128;
/** Channel sums outside this band are page-white and ink-black, both
 *  of which every logo has lots of and neither of which is a brand
 *  colour. */
const MIN_SUM = 60;
const MAX_SUM = 720;
/** 4 bits per channel. Groups shades of one colour that differ only
 *  by anti-aliasing, without merging genuinely different hues. */
const QUANT = 16;

/** 0..1. Chroma over max channel — how far from grey a colour is. */
export function saturationOf({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The logo's brand colour, or null when it hasn't got one.
 *
 * Buckets the pixels by quantised colour and scores each bucket by
 * count × saturation². The square is doing real work: a logo is
 * mostly neutral, so a big bucket of near-grey outline would outvote
 * a small bucket of saturated mark on count alone. Squaring makes
 * being colourful matter more than being common.
 *
 * Returns null for a black-and-white logo, so the caller can fall
 * back rather than tint the footer grey.
 */
export function dominantFromPixels(data: ArrayLike<number>): Rgb | null {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < MIN_ALPHA) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sum = r + g + b;
    if (sum < MIN_SUM || sum > MAX_SUM) continue;

    const key = ((r / QUANT) | 0) << 16 | ((g / QUANT) | 0) << 8 | ((b / QUANT) | 0);
    const cur = buckets.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.n++; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  let best: Rgb | null = null;
  let bestScore = 0;
  for (const bk of buckets.values()) {
    const avg = { r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n };
    const sat = saturationOf(avg);
    // A bucket with no colour at all can never win; without this a
    // mono logo would return its darkest grey.
    if (sat < 0.15) continue;
    const score = bk.n * sat * sat;
    if (score > bestScore) { bestScore = score; best = avg; }
  }
  return best && { r: Math.round(best.r), g: Math.round(best.g), b: Math.round(best.b) };
}

/** sRGB → HSL, h in degrees. */
export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
      max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0))
    : max === gn ? ((bn - rn) / d + 2)
    :              ((rn - gn) / d + 4);
  return { h: h * 60, s, l };
}

/**
 * The band colour: the logo's hue, taken right down to a wash.
 *
 * The band carries near-black text, so the brand colour itself is
 * usually far too dark to sit behind it — a navy logo would give a
 * navy band and an unreadable footer. Keeping the hue and forcing
 * lightness to 0.90 gives a tint that reads as the brand without
 * costing legibility, which is what the reference invoices do.
 *
 * Saturation is capped as well: a fully saturated wash looks like a
 * highlighter, not stationery.
 */
export function toBandTint(rgb: Rgb): string {
  const { h, s } = rgbToHsl(rgb);
  const sat = Math.round(Math.min(s, 0.45) * 100);
  return `hsl(${Math.round(h)}, ${sat}%, 90%)`;
}
