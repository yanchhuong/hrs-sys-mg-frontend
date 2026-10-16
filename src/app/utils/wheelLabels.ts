/**
 * Where and how to write each slice's label on the Spin & Win wheel.
 *
 * A label goes ACROSS its slice (tangential) when it fits there; a narrow
 * slice has little room that way, so a longer label turns ALONG the slice
 * (radial, centre → edge), which has about twice the room on a busy wheel.
 * If it still doesn't fit: a slightly smaller font, then two lines, and
 * only then "…". Labels in the lower half are turned the other way so
 * nobody has to read them upside down.
 *
 * Geometry is in the wheel's SVG units (viewBox -150..150, radius 148).
 * `measure` returns a label's width at a font size — the page measures
 * with a canvas, so Khmer and wide letters are judged correctly.
 */
export interface WheelLabel {
  x: number;
  y: number;
  /** Degrees for transform="rotate(rot x y)". */
  rot: number;
  fontSize: number;
  /** One or two lines (stacked across the reading direction). */
  lines: string[];
  mode: 'across' | 'along';
}

export const WHEEL_R = 148;
/** Keep clear of the SPIN button in the middle and of the rim. */
const INNER = 52;
const OUTER = WHEEL_R - 8;
const ACROSS_R = WHEEL_R * 0.62;
const ALONG_R = (INNER + OUTER) / 2;
const MIN_FONT = 8;
const LINE = 1.15; // line height, × font size

const rad = (deg: number) => (deg * Math.PI) / 180;
const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function layoutWheelLabel(
  label: string, index: number, count: number,
  measure: (text: string, fontSize: number) => number,
): WheelLabel {
  const seg = 360 / count;
  const mid = index * seg + seg / 2; // degrees clockwise from 12 o'clock
  const base = count > 8 ? 10 : 12;
  const text = label.trim() || '—';

  // Room ACROSS the slice at ACROSS_R (its chord, less a margin), and the
  // slice's thickness half-way ALONG it (how many lines can stack there).
  const acrossRoom = Math.min(2 * ACROSS_R * Math.sin(rad(Math.min(seg, 179) / 2)) - 10, 160);
  const alongRoom = OUTER - INNER;
  const alongThickness = 2 * ALONG_R * Math.sin(rad(Math.min(seg, 179) / 2)) - 6;

  const across = (fontSize: number): WheelLabel => {
    // Reading direction = tangent; in the lower half turn it 180° so it reads upright.
    const flip = norm(mid) > 90 && norm(mid) < 270;
    return { ...point(mid, ACROSS_R), rot: flip ? mid + 180 : mid, fontSize, lines: [text], mode: 'across' };
  };
  const along = (fontSize: number, lines: string[]): WheelLabel => {
    // Reading direction = outward from the centre; on the left half read inward instead.
    const left = norm(mid) > 180;
    return { ...point(mid, ALONG_R), rot: left ? mid + 90 : mid - 90, fontSize, lines, mode: 'along' };
  };

  // 1. Across, at the normal size.
  if (measure(text, base) <= acrossRoom) return across(base);
  // 2. Along, at the normal size or one smaller.
  for (let fs = base; fs >= base - 1; fs--) {
    if (measure(text, fs) <= alongRoom) return along(fs, [text]);
  }
  // 3. Along, on two lines (split at the space nearest the middle) —
  //    easier to read than one line in a tiny font.
  const split = splitInTwo(text);
  if (split) {
    for (let fs = base; fs >= MIN_FONT; fs--) {
      const fitsLong = split.every(l => measure(l, fs) <= alongRoom);
      if (fitsLong && 2 * fs * LINE <= alongThickness) return along(fs, split);
    }
  }
  // 4. Along, one line, smaller still.
  for (let fs = base - 2; fs >= MIN_FONT; fs--) {
    if (measure(text, fs) <= alongRoom) return along(fs, [text]);
  }
  // 5. Last resort: shorten with "…".
  let cut = text;
  while (cut.length > 1 && measure(cut + '…', MIN_FONT) > alongRoom) cut = cut.slice(0, -1);
  return along(MIN_FONT, [cut.trimEnd() + '…']);
}

function point(deg: number, radius: number) {
  const a = rad(deg - 90);
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

function splitInTwo(text: string): [string, string] | null {
  const spaces = [...text.matchAll(/\s+/g)].map(m => m.index!);
  if (!spaces.length) return null;
  const middle = text.length / 2;
  const at = spaces.reduce((b, i) => (Math.abs(i - middle) < Math.abs(b - middle) ? i : b));
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}

/** Width of `text` in the wheel's bold label font, via an off-screen
 *  canvas; a rough estimate where canvas isn't available. */
export function makeMeasure(): (text: string, fontSize: number) => number {
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = document.createElement('canvas').getContext('2d'); } catch { ctx = null; }
  const cache = new Map<string, number>();
  return (text, fontSize) => {
    const key = fontSize + '|' + text;
    const hit = cache.get(key);
    if (hit != null) return hit;
    let w: number;
    if (ctx) {
      ctx.font = `700 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
      w = ctx.measureText(text).width;
    } else {
      // Khmer glyphs run wider than Latin ones.
      w = [...text].reduce((s, ch) => s + (/[ក-៿]/.test(ch) ? 0.9 : 0.62), 0) * fontSize;
    }
    cache.set(key, w);
    return w;
  };
}
