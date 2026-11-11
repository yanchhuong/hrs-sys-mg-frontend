/**
 * Barcode label sheets — geometry, rendering and PDF output.
 *
 * One item's barcode, tiled to fill an A4 or A5 page, for printing
 * onto a sheet of blank labels. Everything here works in millimetres,
 * because that is what a sheet of labels is sold in and what jsPDF
 * takes; the on-screen preview converts to px at the very end.
 *
 * Why a PNG and not an <svg> per label: the barcode is encoded ONCE
 * and the same image is placed N times. Encoding per label would be
 * the same bars computed forty times, and jsPDF embeds a repeated
 * image by reference, so the file stays small.
 */

/** Printable paper, portrait, in mm. */
export const PAPER = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
} as const;

export type PaperSize = keyof typeof PAPER;

/** Outer margin on every side, mm. Most desktop printers cannot
 *  reach closer than ~5 mm, and a barcode clipped by the printer's
 *  dead zone is a barcode that will not scan. */
const MARGIN = 8;

/** Gap between labels, mm — the scissor line. */
const GUTTER = 3;

/** A label's height as a fraction of its width. Code 128 needs bars
 *  tall enough for a scanner to find a clean scan line across them;
 *  much flatter than this and handheld readers start missing. */
const ASPECT = 0.42;

export interface LabelGrid {
  /** Labels across and down. */
  cols: number;
  rows: number;
  /** One label's footprint, mm. */
  labelW: number;
  labelH: number;
  /** Labels on one sheet. */
  perPage: number;
  paperW: number;
  paperH: number;
  margin: number;
  gutter: number;
}

/**
 * Lay out `cols` labels across the page and fit as many rows as the
 * height allows.
 *
 * The label's width falls out of the column count, and its height
 * follows from ASPECT — so "labels per row" is the single knob that
 * sets label size, which is how a sheet of labels is actually chosen.
 */
export function labelGrid(paper: PaperSize, cols: number): LabelGrid {
  const { w: paperW, h: paperH } = PAPER[paper];
  const safeCols = Math.max(1, Math.min(8, Math.trunc(cols) || 1));
  const usableW = paperW - MARGIN * 2;
  const usableH = paperH - MARGIN * 2;
  const labelW = (usableW - GUTTER * (safeCols - 1)) / safeCols;
  const labelH = labelW * ASPECT;
  // Rows that fit whole — a label split across the page break would
  // print half a barcode.
  const rows = Math.max(1, Math.floor((usableH + GUTTER) / (labelH + GUTTER)));
  return {
    cols: safeCols, rows, labelW, labelH,
    perPage: safeCols * rows,
    paperW, paperH, margin: MARGIN, gutter: GUTTER,
  };
}

/**
 * Height of the bars themselves, mm — the number that decides
 * whether a handheld can read the label, since a Code 128 scan line
 * has to cross every bar at once.
 */
export function barHeightMm(grid: LabelGrid, withCaption = true): number {
  const innerH = grid.labelH - LABEL_PAD * 2;
  return innerH * (1 - (withCaption ? CAPTION_FRAC : 0) - VALUE_FRAC);
}

/**
 * Shortest bars worth printing, mm.
 *
 * Retail EAN specs ask for far more, but those are written for
 * fixed-position supermarket scanners reading at speed. This is a
 * stock label read deliberately with a handheld, where the common
 * 38x21 mm sheet (65 to an A4) works fine — and that sheet lands
 * just about here. Below it a reader starts needing several passes,
 * which is the point at which the label has failed at its job.
 */
export const MIN_BAR_MM = 8;

/**
 * Of `candidates`, the column counts whose labels are still tall
 * enough to scan on this paper. A5 runs out sooner than A4 simply
 * because the page is smaller.
 */
export function usableCols(paper: PaperSize, candidates: readonly number[]): number[] {
  return candidates.filter(c => barHeightMm(labelGrid(paper, c)) >= MIN_BAR_MM);
}

/** Top-left corner of label `i` on its sheet, mm. */
export function labelOrigin(grid: LabelGrid, i: number): { x: number; y: number } {
  const col = i % grid.cols;
  const row = Math.floor(i / grid.cols) % grid.rows;
  return {
    x: grid.margin + col * (grid.labelW + grid.gutter),
    y: grid.margin + row * (grid.labelH + grid.gutter),
  };
}

/**
 * Encode `value` as a Code 128 barcode and return it as a PNG data
 * URL, with no text under the bars — the label draws its own caption
 * so the font matches the rest of the sheet.
 *
 * Rendered at a fixed, generous pixel density rather than at the
 * on-screen size: the same image goes into the PDF, where it is
 * scaled to millimetres, and an under-sampled barcode prints with
 * ragged bar edges that readers reject.
 *
 * jsbarcode is imported on demand — this runs only when somebody
 * opens the label dialog, and Vite keeps it out of the initial chunk
 * the way capturePrintPdf does with jspdf.
 */
export async function barcodePngDataUrl(value: string): Promise<string> {
  const { default: JsBarcode } = await import('jsbarcode');
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    displayValue: false,
    // Module width in px. 3 keeps the narrowest bar well above the
    // point where scaling to a ~40 mm label softens its edges.
    width: 3,
    height: 160,
    margin: 0,
    background: '#FFFFFF',
    lineColor: '#000000',
  });
  return canvas.toDataURL('image/png');
}

export interface LabelSheetOptions {
  value: string;
  /** Printed above the bars. Usually the item name. */
  caption?: string | null;
  paper: PaperSize;
  cols: number;
  /** How many labels to produce; pages are added as needed. */
  count: number;
}

/**
 * Build the sheet as a PDF.
 *
 * Draws vector text and places the one barcode image per label, so
 * the output is crisp at any zoom — unlike html2canvas, which would
 * rasterise the whole page and is what the invoice templates have to
 * use only because their layout is HTML.
 */
export async function buildLabelsPdf(opts: LabelSheetOptions): Promise<Blob> {
  const total = Math.max(1, opts.count);
  const label: LabelSpec = { value: opts.value, caption: opts.caption };
  return buildLabelSheetPdf({
    labels: Array.from({ length: total }, () => label),
    paper: opts.paper,
    cols: opts.cols,
  });
}

/** One label on a sheet: the barcode value and the line printed above it. */
export interface LabelSpec {
  value: string;
  caption?: string | null;
}

/** Labels per PDF beyond which we stop — a "match stock" run on a
 *  catalogue with a 50,000-unit row would otherwise build a PDF the
 *  browser cannot hold. 5,000 is ~100 A4 sheets at 4 across. */
export const MAX_LABELS_PER_PDF = 5000;

/**
 * Build a sheet of MIXED labels — many items, each repeated as often
 * as its entry appears in `labels`, laid out in order and flowing onto
 * new pages as needed.
 *
 * Each distinct barcode value is encoded once and placed by alias, so
 * forty copies of one item cost one embedded image, not forty.
 * Values that cannot be encoded (Code 128 is ASCII-only) are skipped
 * and returned, rather than failing the whole sheet over one item.
 */
export async function buildLabelSheetPdf(opts: {
  labels: LabelSpec[];
  paper: PaperSize;
  cols: number;
}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const grid = labelGrid(opts.paper, opts.cols);
  const pngs = await encodeAll(opts.labels.map(l => l.value));
  const printable = opts.labels.filter(l => pngs.has(l.value));
  if (printable.length === 0) throw new Error('None of these barcodes could be encoded');
  if (printable.length > MAX_LABELS_PER_PDF) {
    throw new Error(`Too many labels (${printable.length}) — the limit is ${MAX_LABELS_PER_PDF} per PDF`);
  }

  const doc = new jsPDF({ unit: 'mm', format: opts.paper.toLowerCase() as 'a4' | 'a5' });
  printable.forEach((label, i) => {
    if (i > 0 && i % grid.perPage === 0) doc.addPage();
    const { x, y } = labelOrigin(grid, i);
    drawLabel(doc, x, y, grid, pngs.get(label.value)!, label);
  });
  return doc.output('blob');
}

/**
 * PNG data URL for each distinct value. Values jsbarcode rejects are
 * left out of the map, which is how callers learn which to skip.
 */
export async function encodeAll(values: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const v of new Set(values)) {
    try {
      out.set(v, await barcodePngDataUrl(v));
    } catch {
      /* not encodable as Code 128 — caller sees it missing */
    }
  }
  return out;
}

/* Label interior, as fractions of the label's height: caption band,
 * bars, then the human-readable value. Exported so the preview and
 * the PDF cannot drift apart. */
export const LABEL_PAD = 1.2;    // mm inside the label edge
export const CAPTION_FRAC = 0.22;
export const VALUE_FRAC = 0.24;
const PAD = LABEL_PAD;

function drawLabel(
  // jsPDF's own type is only available inside the dynamic import, and
  // naming it here would pull the module into the initial chunk.
  doc: {
    setFontSize: (n: number) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (t: string, x: number, y: number, o?: { align?: string; maxWidth?: number }) => void;
    addImage: (d: string, f: string, x: number, y: number, w: number, h: number, alias?: string) => void;
  },
  x: number, y: number, grid: LabelGrid, png: string, opts: LabelSpec,
) {
  const innerW = grid.labelW - PAD * 2;
  const innerH = grid.labelH - PAD * 2;
  const captionH = opts.caption ? innerH * CAPTION_FRAC : 0;
  const valueH = innerH * VALUE_FRAC;
  const barsH = innerH - captionH - valueH;
  const cx = x + grid.labelW / 2;

  if (opts.caption) {
    // mm → pt, then back off so a long name still sits on one line.
    doc.setFontSize(Math.max(5, Math.min(9, captionH * 2.4)));
    doc.setTextColor(17, 24, 39);
    doc.text(truncate(opts.caption, maxChars(innerW, 2.0)), cx, y + PAD + captionH * 0.78, { align: 'center' });
  }

  // Alias by value so jsPDF embeds each barcode once and references it
  // for every copy — without it, it hashes the whole data URL per call.
  doc.addImage(png, 'PNG', x + PAD, y + PAD + captionH, innerW, barsH, `bc-${opts.value}`);

  doc.setFontSize(Math.max(5, Math.min(9, valueH * 2.4)));
  doc.setTextColor(55, 65, 81);
  doc.text(opts.value, cx, y + PAD + captionH + barsH + valueH * 0.78, { align: 'center' });
}

/** Rough chars that fit in `mm` at the given pt size — jsPDF can
 *  measure precisely, but that needs the doc instance and this only
 *  has to stop a long name overrunning the label. */
function maxChars(mm: number, ptPerChar: number): number {
  return Math.max(4, Math.floor(mm / (ptPerChar * 0.36)));
}

export function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}
