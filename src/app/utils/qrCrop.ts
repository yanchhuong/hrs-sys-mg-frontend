/**
 * v-qr-crop-finders — locate the QR code inside an uploaded image.
 *
 * Split from the DOM so the hard part can be run and checked on its
 * own. Nothing here touches canvas or window.
 *
 * WHY THIS EXISTS. The previous crop took the bounding box of every
 * neutral-dark pixel in the image. That works on a bare QR PNG and
 * fails on everything people actually upload: a phone screenshot of
 * a banking app, where the bank name, the account number and the
 * dark UI chrome are all "neutral-dark" too. The box grew to the
 * whole screenshot, the crop became a no-op, and the invoice printed
 * the entire phone screen where the QR should be.
 *
 * So instead of asking "where is the ink", this asks "where is the
 * QR" — by finding its three finder patterns, the nested squares in
 * the corners. A line through one of them crosses dark/light runs in
 * the ratio 1:1:3:1:1, which is the same signature every QR decoder
 * looks for first, and which text and UI chrome essentially never
 * produce in both axes at the same point.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** A located finder pattern: its centre, and the QR's module size in px. */
export interface Finder { x: number; y: number; module: number }

/** Dark enough to be QR ink. Also used by the fallback below. */
const DARK_MAX = 100;
/** Below this alpha a pixel is transparency, not ink. */
const MIN_ALPHA = 200;
/** Run lengths may drift this far from the ideal before the 1:1:3:1:1
 *  signature is rejected — half a module, which is what zxing uses.
 *
 *  It was 0.6 first, and that was too slack to tell a finder from an
 *  evenly striped 1:1:1:1:1 run: at 0.6 the centre bar's allowance
 *  (3x the tolerance) is wide enough to call a single module a
 *  triple. UI lists and table rules produce exactly that pattern, so
 *  the looser value invited false positives that only the vertical
 *  pass was rejecting. */
const RATIO_TOLERANCE = 0.5;
/** A finder smaller than this is noise, not a QR corner. */
const MIN_MODULE = 1;

/** rgba → 1 for dark ink, 0 for anything else. */
export function toBinary(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    if (rgba[i + 3] < MIN_ALPHA) continue;          // transparent
    if (rgba[i] < DARK_MAX && rgba[i + 1] < DARK_MAX && rgba[i + 2] < DARK_MAX) out[p] = 1;
  }
  return out;
}

/** Does a 5-run window read 1:1:3:1:1? Returns the module size, or 0. */
export function moduleSizeOf(runs: ArrayLike<number>): number {
  if (runs.length !== 5) return 0;
  let total = 0;
  for (let i = 0; i < 5; i++) total += runs[i];
  const mod = total / 7;
  if (mod < MIN_MODULE) return 0;
  const tol = mod * RATIO_TOLERANCE;
  if (Math.abs(runs[0] - mod) >= tol) return 0;
  if (Math.abs(runs[1] - mod) >= tol) return 0;
  if (Math.abs(runs[2] - mod * 3) >= tol * 3) return 0;
  if (Math.abs(runs[3] - mod) >= tol) return 0;
  if (Math.abs(runs[4] - mod) >= tol) return 0;
  return mod;
}

/**
 * Finder centres along one line.
 *
 * `at(i)` reads the line, `len` is how long it is. Run-length encode
 * it, then slide a 5-run window that starts on ink. Because runs
 * alternate by construction, a window starting dark is always
 * dark/light/dark/light/dark — no need to re-check the colours.
 *
 * Returns the centre OFFSET along the line, so the caller maps it
 * back to x or y.
 */
export function scanLine(at: (i: number) => number, len: number): { centre: number; module: number }[] {
  const runs: { start: number; len: number; dark: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= len; i++) {
    if (i === len || at(i) !== at(start)) {
      runs.push({ start, len: i - start, dark: at(start) === 1 });
      start = i;
    }
  }
  const hits: { centre: number; module: number }[] = [];
  for (let i = 0; i + 4 < runs.length; i++) {
    if (!runs[i].dark) continue;
    const five = [runs[i].len, runs[i + 1].len, runs[i + 2].len, runs[i + 3].len, runs[i + 4].len];
    const mod = moduleSizeOf(five);
    if (!mod) continue;
    hits.push({ centre: runs[i + 2].start + runs[i + 2].len / 2, module: mod });
  }
  return hits;
}

/**
 * Finder patterns in a binary image.
 *
 * A candidate must show the signature on BOTH axes through the same
 * point. That second condition is what rejects ordinary page
 * content: a row of text can accidentally produce 1:1:3:1:1, but it
 * will not also produce it vertically through the same pixel.
 */
export function findFinders(bin: ArrayLike<number>, width: number, height: number): Finder[] {
  const raw: Finder[] = [];
  for (let y = 0; y < height; y++) {
    const row = (x: number) => bin[y * width + x];
    for (const h of scanLine(row, width)) {
      const x = Math.round(h.centre);
      if (x < 0 || x >= width) continue;
      const col = (yy: number) => bin[yy * width + x];
      // Vertical confirmation: a run through the same column has to
      // show the same signature at roughly the same scale.
      const ok = scanLine(col, height).some(
        v => Math.abs(v.centre - y) <= h.module * 2 && Math.abs(v.module - h.module) <= h.module * 0.7,
      );
      if (ok) raw.push({ x, y, module: h.module });
    }
  }
  return clusterFinders(raw);
}

/** Collapse the many rows that cross one finder into a single centre. */
export function clusterFinders(raw: Finder[]): Finder[] {
  const groups: Finder[][] = [];
  for (const f of raw) {
    const g = groups.find(grp => {
      const c = grp[0];
      return Math.abs(c.x - f.x) <= c.module * 3 && Math.abs(c.y - f.y) <= c.module * 3;
    });
    if (g) g.push(f); else groups.push([f]);
  }
  // Biggest clusters first: a real finder is crossed by ~7 modules'
  // worth of rows, a stray coincidence by one or two.
  return groups
    .sort((a, b) => b.length - a.length)
    .map(g => ({
      x: g.reduce((s, f) => s + f.x, 0) / g.length,
      y: g.reduce((s, f) => s + f.y, 0) / g.length,
      module: g.reduce((s, f) => s + f.module, 0) / g.length,
    }));
}

/**
 * The QR's bounds from its finder centres.
 *
 * Each centre sits 3.5 modules in from its two edges, so the box
 * around the three centres, grown by 3.5 modules on every side, is
 * the code. Three is enough even though a QR has four corners: the
 * top-right centre supplies the right edge and the bottom-left one
 * the bottom edge.
 */
export function boundsFromFinders(finders: Finder[]): Rect | null {
  if (finders.length < 3) return null;
  const three = finders.slice(0, 3);
  const module = three.reduce((s, f) => s + f.module, 0) / 3;
  const xs = three.map(f => f.x);
  const ys = three.map(f => f.y);
  const edge = module * 3.5;
  const x = Math.min(...xs) - edge;
  const y = Math.min(...ys) - edge;
  const w = (Math.max(...xs) - Math.min(...xs)) + edge * 2;
  const h = (Math.max(...ys) - Math.min(...ys)) + edge * 2;
  // A QR is square; three collinear false positives are not.
  if (w <= 0 || h <= 0) return null;
  const ratio = w / h;
  if (ratio < 0.6 || ratio > 1.65) return null;
  return { x, y, w, h };
}

/**
 * The old heuristic, kept as the fallback: the box around every dark
 * pixel. Right for a bare QR PNG, which is still the common upload,
 * and harmless when the finder search already succeeded.
 */
export function boundsFromDarkPixels(rgba: ArrayLike<number>, width: number, height: number): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < MIN_ALPHA) continue;
      if (rgba[i] < DARK_MAX && rgba[i + 1] < DARK_MAX && rgba[i + 2] < DARK_MAX) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The square to crop to: the QR, squared up and given a quiet zone.
 *
 * Finder detection first, the dark-pixel box second, null if neither
 * found anything — the caller keeps the original image on null.
 */
export function findQrRect(rgba: ArrayLike<number>, width: number, height: number): Rect | null {
  if (!width || !height) return null;

  const bin = toBinary(rgba, width, height);
  const finders = findFinders(bin, width, height);
  let box = boundsFromFinders(finders);
  let quiet: number;

  if (box) {
    // 4 modules is the quiet zone the QR spec asks for. Take the
    // module size from the finders themselves — an earlier version
    // derived it from the code's width assuming 25 modules, which
    // is only true of a version-2 QR. A real KHQR is version 7
    // (45 modules), so that guess came out nearly twice too big;
    // on a version-1 code it came out too small, which is the
    // direction that actually costs scans.
    const module = (finders[0].module + finders[1].module + finders[2].module) / 3;
    quiet = module * 4;
  } else {
    box = boundsFromDarkPixels(rgba, width, height);
    if (!box) return null;
    quiet = Math.max(box.w, box.h) * 0.04;
  }

  const side = Math.max(box.w, box.h) + quiet * 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let x = Math.round(cx - side / 2);
  let y = Math.round(cy - side / 2);
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  const s = Math.round(Math.min(side, width - x, height - y));
  if (s < 16) return null;
  return { x, y, w: s, h: s };
}
