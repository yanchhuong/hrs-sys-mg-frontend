/**
 * BarcodeLabelsDialog — print an item's barcode as a sheet of labels.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Barcode labels · Blue Hoodie             │
 *   │ Paper [A4 ▾]  Per row [4 ▾]   32 labels  │
 *   │ ┌────────────────────────────┐           │
 *   │ │ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐    │  preview  │
 *   │ │ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐    │  of one   │
 *   │ └────────────────────────────┘  sheet    │
 *   │                   [Cancel] [Download PDF]│
 *   └──────────────────────────────────────────┘
 *
 * The preview is the real geometry (barcodeLabels.labelGrid) scaled
 * from mm to px, and the PDF is drawn from that same grid — so what
 * is on screen is the sheet that comes out, not an approximation of
 * it. "Labels per row" is the only size control, because it is the
 * one that matters: it sets the label's width, and the height follows
 * from the aspect a scanner needs.
 *
 * Quantity is not asked for. The sheet is filled — that is what the
 * page is for, and a half-empty sheet of labels wastes the sheet.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Barcode as BarcodeIcon, Download, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  MIN_BAR_MM, PAPER, barHeightMm, barcodePngDataUrl, buildLabelsPdf, labelGrid,
  truncate, usableCols,
  type PaperSize,
} from '../../utils/barcodeLabels';

const SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs '
  + 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

/** Preview width in px. The sheet is scaled to this, so A5 draws
 *  smaller than A4 at the same column count — which is the honest
 *  picture, since its labels really are smaller. */
const PREVIEW_W = 380;

/* Offered before the scannability filter below trims them. 6 across
 * an A4 is a 12 mm label whose bars are ~5 mm — it fits on the page
 * and cannot be read, so it is not offered. */
const PER_ROW_CHOICES = [2, 3, 4, 5, 6] as const;

export interface BarcodeLabelsTarget {
  name: string;
  sku?: string | null;
  barcode: string;
}

export function BarcodeLabelsDialog({
  item, onClose,
}: {
  /** Null closes the dialog. The caller only opens this for an item
   *  that HAS a barcode — there is nothing to print otherwise. */
  item: BarcodeLabelsTarget | null;
  onClose: () => void;
}) {
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [perRow, setPerRow] = useState(4);
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => labelGrid(paper, perRow), [paper, perRow]);
  const choices = useMemo(() => usableCols(paper, PER_ROW_CHOICES), [paper]);
  const barMm = barHeightMm(grid);

  // Switching A4 → A5 shrinks every label, so a column count that was
  // fine can drop under the scannable floor. Fall back to the
  // densest one that still works rather than silently printing
  // labels nobody can read.
  useEffect(() => {
    if (choices.length && !choices.includes(perRow)) {
      setPerRow(choices[choices.length - 1]);
    }
  }, [choices, perRow]);

  // Encode once per barcode VALUE — not per paper/per-row change (the
  // bars are the same picture however the sheet is laid out), and not
  // per `item` identity, which the caller rebuilds inline on every
  // render and would re-encode on each one.
  const value = item?.barcode ?? null;
  useEffect(() => {
    if (!value) { setPng(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const url = await barcodePngDataUrl(value);
        if (!cancelled) setPng(url);
      } catch {
        if (!cancelled) {
          setPng(null);
          toast.error('Could not render this barcode');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  const download = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const blob = await buildLabelsPdf({
        value: item.barcode,
        caption: item.name,
        paper,
        cols: perRow,
        count: grid.perPage,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName(item.sku || item.name)}-barcode-${paper}.pdf`;
      a.click();
      // Revoking straight away can cancel the download in Firefox;
      // one tick is enough for the click to have been taken.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${grid.perPage} labels · ${paper}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the PDF');
    } finally {
      setBusy(false);
    }
  };

  // mm → px for the preview.
  const scale = PREVIEW_W / grid.paperW;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarcodeIcon className="h-4 w-4" />
            Barcode labels
          </DialogTitle>
          <DialogDescription>
            {item ? <>{item.name} · <span className="font-mono">{item.barcode}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value as PaperSize)}
            className={SELECT_CLS}
            aria-label="Paper size"
          >
            {(Object.keys(PAPER) as PaperSize[]).map(p => (
              <option key={p} value={p}>Paper : {p}</option>
            ))}
          </select>
          <select
            value={perRow}
            onChange={(e) => setPerRow(Number(e.target.value))}
            className={SELECT_CLS}
            aria-label="Labels per row"
          >
            {choices.map(n => (
              <option key={n} value={n}>Per row : {n}</option>
            ))}
          </select>
          {/* Bar height is the number that decides whether the sheet
              is any use, so it is on screen rather than implied. */}
          <span className="text-sm text-gray-500 ml-auto">
            {grid.perPage} labels · {grid.labelW.toFixed(0)}×{grid.labelH.toFixed(0)} mm
            <span className={barMm < MIN_BAR_MM ? 'text-amber-600' : undefined}>
              {' '}· {barMm.toFixed(0)} mm bars
            </span>
          </span>
        </div>

        {/* One sheet, to scale. */}
        <div className="flex justify-center">
          <div
            className="relative bg-white border shadow-sm overflow-hidden"
            style={{ width: PREVIEW_W, height: grid.paperH * scale }}
            aria-label={`Preview of one ${paper} sheet`}
          >
            {Array.from({ length: grid.perPage }, (_, i) => {
              const col = i % grid.cols;
              const row = Math.floor(i / grid.cols);
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-center justify-center overflow-hidden border border-dashed border-gray-200"
                  style={{
                    left:   (grid.margin + col * (grid.labelW + grid.gutter)) * scale,
                    top:    (grid.margin + row * (grid.labelH + grid.gutter)) * scale,
                    width:  grid.labelW * scale,
                    height: grid.labelH * scale,
                    padding: 1.2 * scale,
                  }}
                >
                  {item && (
                    <span className="w-full text-center leading-none text-gray-900 truncate"
                          style={{ fontSize: Math.max(3, grid.labelH * scale * 0.17) }}>
                      {truncate(item.name, 22)}
                    </span>
                  )}
                  {png
                    ? <img src={png} alt="" className="w-full" style={{ height: grid.labelH * scale * 0.5, objectFit: 'fill' }} />
                    : <div className="w-full bg-gray-100" style={{ height: grid.labelH * scale * 0.5 }} />}
                  <span className="w-full text-center leading-none font-mono text-gray-700 truncate"
                        style={{ fontSize: Math.max(3, grid.labelH * scale * 0.17) }}>
                    {item?.barcode}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={download} disabled={busy || !png}>
            {busy
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Filename-safe, so a name with a slash does not break the save. */
function safeName(s: string): string {
  return s.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}
