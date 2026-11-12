/**
 * BulkBarcodeLabelsDialog — print barcode labels for MANY items at once,
 * to stick on the products themselves.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Barcode labels · 12 items                                    │
 *   │ Paper [A4▾] Per row [4▾] Copies [1 each ▾]                   │
 *   │ ┌ items ───────────────────┐  ┌ sheet 1 / 3 ───────────────┐ │
 *   │ │ ☑ Cup    69437…   [ 5 ]  │  │ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐    │ │
 *   │ │ ☑ Water  88460…   [10 ]  │  │ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐ ▌▍▌▍▐    │ │
 *   │ └──────────────────────────┘  └────────────────────────────┘ │
 *   │ 15 labels · 1 sheet · 46×19 mm       [Cancel] [Download PDF] │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Same geometry and PDF drawing as the single-item BarcodeLabelsDialog
 * (utils/barcodeLabels) — the only difference is that the sheet holds a
 * mix of items, each repeated as many times as its "copies" says.
 * Labels flow item by item, so one item's labels sit together and are
 * easy to peel off and match to the shelf.
 *
 * Copies presets:
 *   - 1 each      — a test / sample run, one of everything.
 *   - Full row    — one row of the sheet per item; tidy to cut apart.
 *   - Stock qty   — one label per unit on hand, i.e. label every
 *                   product currently in stock. Out-of-stock → 0.
 * Any row can then be edited by hand; the preset just fills the column.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Barcode as BarcodeIcon, ChevronLeft, ChevronRight, Download, Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  MAX_LABELS_PER_PDF, MIN_BAR_MM, PAPER, barHeightMm, buildLabelSheetPdf, encodeAll,
  labelGrid, truncate, usableCols,
  type LabelSpec, type PaperSize,
} from '../../utils/barcodeLabels';
import { DropdownSelect } from './DropdownSelect';

const SELECT_CLS =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs '
  + 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0';

const PREVIEW_W = 340;
const PER_ROW_CHOICES = [2, 3, 4, 5, 6] as const;
const MAX_COPIES = 9999;

type Preset = 'one' | 'row' | 'stock';

export interface BulkLabelItem {
  id: string;
  name: string;
  sku?: string | null;
  barcode: string;
  stockQty?: number | null;
}

export function BulkBarcodeLabelsDialog({
  items, skippedNoBarcode = 0, onClose,
}: {
  /** Null closes the dialog. Only items WITH a barcode belong here. */
  items: BulkLabelItem[] | null;
  /** How many items in the caller's set had no barcode — shown so the
   *  operator knows why they are missing rather than wondering. */
  skippedNoBarcode?: number;
  onClose: () => void;
}) {
  const [paper, setPaper] = useState<PaperSize>('A4');
  const [perRow, setPerRow] = useState(4);
  const [preset, setPreset] = useState<Preset>('one');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pngs, setPngs] = useState<Map<string, string> | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => labelGrid(paper, perRow), [paper, perRow]);
  const choices = useMemo(() => usableCols(paper, PER_ROW_CHOICES), [paper]);
  const barMm = barHeightMm(grid);

  useEffect(() => {
    if (choices.length && !choices.includes(perRow)) {
      setPerRow(choices[choices.length - 1]);
    }
  }, [choices, perRow]);

  // Reset selection whenever a new set of items comes in.
  const itemsKey = items?.map(i => i.id).join('|') ?? '';
  useEffect(() => {
    if (!items) return;
    setSelected(Object.fromEntries(items.map(i => [i.id, true])));
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  // (Re)fill the copies column from the preset. "Full row" depends on
  // the column count, so it follows perRow too.
  useEffect(() => {
    if (!items) return;
    setCopies(Object.fromEntries(items.map(i => [i.id, presetCopies(preset, i, grid.cols)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, preset, grid.cols]);

  // Encode each distinct barcode once. Values Code 128 cannot carry
  // (non-ASCII) come back missing and are flagged in the list.
  const valuesKey = items?.map(i => i.barcode).join('|') ?? '';
  useEffect(() => {
    if (!items) { setPngs(null); return; }
    let cancelled = false;
    setPngs(null);
    void encodeAll(items.map(i => i.barcode)).then(m => { if (!cancelled) setPngs(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  const invalid = (it: BulkLabelItem) => !!pngs && !pngs.has(it.barcode);

  /** The sheet, in print order. */
  const labels: LabelSpec[] = useMemo(() => {
    if (!items) return [];
    const out: LabelSpec[] = [];
    for (const it of items) {
      if (!selected[it.id] || (pngs && !pngs.has(it.barcode))) continue;
      const n = Math.min(MAX_COPIES, Math.max(0, copies[it.id] ?? 0));
      for (let k = 0; k < n && out.length <= MAX_LABELS_PER_PDF; k++) {
        out.push({ value: it.barcode, caption: it.name });
      }
    }
    return out;
  }, [items, selected, copies, pngs]);

  const total = useMemo(() => {
    if (!items) return 0;
    return items.reduce((s, it) =>
      s + (selected[it.id] && !invalid(it) ? Math.max(0, copies[it.id] ?? 0) : 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selected, copies, pngs]);
  const tooMany = total > MAX_LABELS_PER_PDF;
  const pages = Math.max(1, Math.ceil(total / grid.perPage));
  const safePage = Math.min(page, pages - 1);
  const pageLabels = labels.slice(safePage * grid.perPage, (safePage + 1) * grid.perPage);

  const selectedCount = items?.filter(i => selected[i.id]).length ?? 0;
  const allSelected = !!items && selectedCount === items.length;

  const download = async () => {
    if (!labels.length || tooMany) return;
    setBusy(true);
    try {
      const blob = await buildLabelSheetPdf({ labels, paper, cols: perRow });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `barcode-labels-${labels.length}-${paper}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${labels.length} label${labels.length === 1 ? '' : 's'} · ${pages} sheet${pages === 1 ? '' : 's'} · ${paper}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the PDF');
    } finally {
      setBusy(false);
    }
  };

  const scale = PREVIEW_W / grid.paperW;
  const fontPx = Math.max(3, grid.labelH * scale * 0.17);

  return (
    <Dialog open={!!items} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarcodeIcon className="h-4 w-4" />
            Barcode labels
          </DialogTitle>
          <DialogDescription>
            {items?.length ?? 0} item{items?.length === 1 ? '' : 's'} with a barcode
            {skippedNoBarcode > 0 && <> · {skippedNoBarcode} without a barcode skipped</>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x">
          <DropdownSelect value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}
                  className={SELECT_CLS} aria-label="Paper size">
            {(Object.keys(PAPER) as PaperSize[]).map(p => (
              <option key={p} value={p}>Paper : {p}</option>
            ))}
          </DropdownSelect>
          <DropdownSelect value={perRow} onChange={(e) => setPerRow(Number(e.target.value))}
                  className={SELECT_CLS} aria-label="Labels per row">
            {choices.map(n => <option key={n} value={n}>Per row : {n}</option>)}
          </DropdownSelect>
          <DropdownSelect value={preset} onChange={(e) => setPreset(e.target.value as Preset)}
                  className={SELECT_CLS} aria-label="Copies per item"
                  title="Fills the Copies column — each row can still be edited">
            <option value="one">Copies : 1 each</option>
            <option value="row">Copies : Full row each</option>
            <option value="stock">Copies : Match stock qty</option>
          </DropdownSelect>
          <span className="text-sm text-gray-500 ml-auto whitespace-nowrap shrink-0">
            {grid.labelW.toFixed(0)}×{grid.labelH.toFixed(0)} mm
            <span className={barMm < MIN_BAR_MM ? 'text-amber-600' : undefined}>
              {' '}· {barMm.toFixed(0)} mm bars
            </span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          {/* Item list */}
          <div className="border rounded-md flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 text-xs font-medium text-gray-600">
              <Checkbox
                checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false}
                onCheckedChange={(c) => items && setSelected(
                  Object.fromEntries(items.map(i => [i.id, c === true])))}
                aria-label="Select all items"
              />
              <span className="flex-1">Item ({selectedCount}/{items?.length ?? 0})</span>
              <span className="w-20 text-right">Copies</span>
            </div>
            <div className="overflow-y-auto max-h-[22rem] divide-y">
              {items?.map(it => {
                const bad = invalid(it);
                return (
                  <div key={it.id}
                       className={`flex items-center gap-2 px-3 py-1.5 text-sm ${bad ? 'opacity-60' : 'hover:bg-gray-50'}`}>
                    <label className={`flex flex-1 items-center gap-2 min-w-0 ${bad ? '' : 'cursor-pointer'}`}>
                    <Checkbox
                      checked={!!selected[it.id] && !bad}
                      disabled={bad}
                      onCheckedChange={(c) => setSelected(s => ({ ...s, [it.id]: c === true }))}
                      aria-label={`Include ${it.name}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-gray-900">{it.name}</span>
                      <span className="flex items-center gap-1 text-xs font-mono text-gray-500 truncate">
                        {it.barcode}
                        {bad && (
                          <span className="inline-flex items-center gap-0.5 font-sans text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> cannot encode
                          </span>
                        )}
                        {preset === 'stock' && !bad && (
                          <span className="font-sans text-gray-400">· stock {Number(it.stockQty ?? 0)}</span>
                        )}
                      </span>
                    </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={MAX_COPIES}
                      inputMode="numeric"
                      value={copies[it.id] ?? 0}
                      disabled={bad || !selected[it.id]}
                      onChange={(e) => {
                        const n = Math.min(MAX_COPIES, Math.max(0, Math.trunc(Number(e.target.value)) || 0));
                        setCopies(c => ({ ...c, [it.id]: n }));
                      }}
                      className="w-20 h-8 rounded-md border border-input bg-transparent px-2 text-sm text-right tabular-nums disabled:opacity-50"
                      aria-label={`Copies of ${it.name}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview — the real sheet, one page at a time. */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative bg-white border shadow-sm overflow-hidden"
              style={{ width: PREVIEW_W, height: grid.paperH * scale }}
              aria-label={`Preview of ${paper} sheet ${safePage + 1}`}
            >
              {!pngs && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {pngs && pageLabels.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                  Nothing selected
                </div>
              )}
              {pngs && pageLabels.map((l, i) => {
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
                    <span className="w-full text-center leading-none text-gray-900 truncate" style={{ fontSize: fontPx }}>
                      {truncate(l.caption ?? '', 22)}
                    </span>
                    <img src={pngs.get(l.value)} alt="" className="w-full"
                         style={{ height: grid.labelH * scale * 0.5, objectFit: 'fill' }} />
                    <span className="w-full text-center leading-none font-mono text-gray-700 truncate" style={{ fontSize: fontPx }}>
                      {l.value}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                      disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                      aria-label="Previous sheet">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">Sheet {safePage + 1} / {pages}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                      disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}
                      aria-label="Next sheet">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:items-center">
          <span className={`text-sm mr-auto ${tooMany ? 'text-red-600' : 'text-gray-500'}`}>
            {tooMany
              ? `${total.toLocaleString()} labels — limit is ${MAX_LABELS_PER_PDF.toLocaleString()} per PDF`
              : `${total.toLocaleString()} label${total === 1 ? '' : 's'} · ${pages} sheet${pages === 1 ? '' : 's'}`}
          </span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={download} disabled={busy || !pngs || total === 0 || tooMany}>
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

function presetCopies(preset: Preset, it: BulkLabelItem, cols: number): number {
  switch (preset) {
    case 'one':   return 1;
    case 'row':   return cols;
    case 'stock': return Math.min(MAX_COPIES, Math.max(0, Math.trunc(Number(it.stockQty ?? 0))));
  }
}
