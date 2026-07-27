import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../ui/tooltip';
import {
  FileSpreadsheet, Upload, Download, AlertCircle, AlertTriangle, CheckCircle, RefreshCw, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  parseItemsExcel, downloadItemTemplate, toItemRequest,
  ParsedItemData, ParsedItemRow,
} from '../../utils/itemBulkParser';
import * as itemsApi from '../../api/items';
import * as warehousesApi from '../../api/warehouses';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  /** Existing catalog rows — used for SKU-collision detection at
   *  parse time so a duplicate Code surfaces before Import. */
  existingItems?: itemsApi.Item[];
}

type RowStatus = 'pending' | 'creating' | 'created' | 'failed';
interface RowProgress {
  rowNumber: number;
  status: RowStatus;
  message?: string;
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onEach?: (item: T, index: number, result: R | Error) => void,
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);
  let cursor = 0;
  const take = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i], i);
        results[i] = r;
        onEach?.(items[i], i, r);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        results[i] = e;
        onEach?.(items[i], i, e);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, take));
  return results;
}

/**
 * Bulk-import catalog items from an Excel workbook. One row = one
 * item (no nested-line logic like Invoice / Bill). Uses the standard
 * itemsApi.create endpoint under the hood so per-row validation +
 * uniqueness checks match manual creates exactly.
 */
export function BulkUploadItemsDialog({
  open, onOpenChange, onImported, existingItems = [],
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedItemData | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  // The caller's `existingItems` prop is usually just the currently-
  // visible page (server-side pagination on Items.tsx). We fetch the
  // full catalog on dialog open so SKU-lookup is authoritative across
  // every existing row, not just the on-screen page.
  const [fullCatalog, setFullCatalog] = useState<itemsApi.Item[]>(existingItems);
  // V149 — resolve Warehouse cells (name → id) at parse time. Fetched
  // when the dialog opens; a 403 (feature off) yields an empty list
  // which makes the parser treat every Warehouse cell as unknown +
  // emit warnings — the operator sees why nothing landed and can
  // enable the feature under Items → Settings before re-uploading.
  const [warehouses, setWarehouses] = useState<warehousesApi.Warehouse[]>([]);
  // Reverse lookup for the preview table's Warehouse column — parser
  // stores the UUID after resolving the name; the table shows the name
  // back so operators recognise it at a glance.
  const warehouseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of warehouses) m.set(w.id, w.name);
    return m;
  }, [warehouses]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await itemsApi.list({ size: 10000 });
        if (!cancelled) setFullCatalog(res.content ?? []);
      } catch {
        // Falls through to the prop-supplied list on failure. Worst
        // case: a duplicate SKU tries create() and fails visibly.
      }
      try {
        const ws = await warehousesApi.list();
        if (!cancelled) setWarehouses(ws ?? []);
      } catch {
        // Silent — feature may be off, or user lacks stock.view on
        // warehouses. Parser tolerates an empty list.
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!parsed) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(parsed.items.filter(r => r.errors.length === 0).map(r => r.rowNumber)));
  }, [parsed]);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setParsing(false);
    setImporting(false);
    setProgress(new Map());
    setFinalResult(null);
    setSelectedRows(new Set());
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParsed(null);
    setFinalResult(null);
    setProgress(new Map());
    try {
      const result = await parseItemsExcel(f, fullCatalog, warehouses);
      setParsed(result);
      const errorRows = result.items.filter(r => r.errors.length > 0).length;
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else if (errorRows > 0) {
        toast.error(`${errorRows} row${errorRows !== 1 ? 's' : ''} have issues — review before import.`);
      } else if (result.totalItems > 0) {
        toast.success(`Ready to import ${result.validItems} item${result.validItems !== 1 ? 's' : ''}`);
      } else {
        toast.error('No item rows found in the workbook.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    const rowsToImport = parsed.items.filter(
      r => selectedRows.has(r.rowNumber) && r.errors.length === 0,
    );
    if (rowsToImport.length === 0) {
      toast.error('Select at least one valid row to import.');
      return;
    }

    const initial = new Map<number, RowProgress>(
      rowsToImport.map(r => [r.rowNumber, { rowNumber: r.rowNumber, status: 'pending' as const }]),
    );
    setProgress(initial);
    setImporting(true);

    let okCount = 0;
    let failCount = 0;

    await runWithConcurrency(
      rowsToImport,
      async (row) => {
        setProgress(prev => {
          const next = new Map(prev);
          next.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'creating' });
          return next;
        });
        // Existing SKU → UPDATE (backend also emits an ADJUSTMENT
        // movement for any stockQty delta). New SKU → CREATE (backend
        // emits an opening-balance IN movement when stockQty > 0).
        if (row.existingItemId) {
          return itemsApi.update(row.existingItemId, toItemRequest(row));
        }
        return itemsApi.create(toItemRequest(row));
      },
      // 5 concurrent creates — items are single-transaction rows so
      // we can push the pool a bit higher than the multi-item
      // Invoice / Bill flows without straining the DB.
      5,
      (row, _i, result) => {
        if (result instanceof Error) {
          failCount++;
          setProgress(prev => {
            const next = new Map(prev);
            next.set(row.rowNumber, {
              rowNumber: row.rowNumber, status: 'failed', message: result.message,
            });
            return next;
          });
        } else {
          okCount++;
          setProgress(prev => {
            const next = new Map(prev);
            next.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'created' });
            return next;
          });
        }
      },
    );

    setImporting(false);
    setFinalResult({ ok: okCount, failed: failCount });

    if (okCount > 0) {
      onImported();
      toast.success(
        failCount === 0
          ? `Imported ${okCount} item${okCount !== 1 ? 's' : ''}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No items imported — every row failed. See the list for details.', { duration: 8000 });
    }
  };

  const summary = parsed ? {
    total: parsed.totalItems,
    valid: parsed.validItems,
    errorRows: parsed.items.filter(r => r.errors.length > 0).length,
    toUpdate: parsed.items.filter(r => r.errors.length === 0 && r.existingItemId).length,
    toInsert: parsed.items.filter(r => r.errors.length === 0 && !r.existingItemId).length,
  } : null;

  const doneCount = Array.from(progress.values()).filter(p => p.status === 'created' || p.status === 'failed').length;
  const progressPct = selectedRows.size > 0 ? Math.round((doneCount / selectedRows.size) * 100) : 0;

  const toggleOne = (rowNumber: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        if (importing) {
          toast.error('Import still in progress — please wait');
          return;
        }
        reset();
      }
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-[96vw] xl:max-w-6xl flex flex-col max-h-[95vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Bulk Items
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Upload an Excel file (.xlsx). One row per catalog item. Item Name is required; every other column is optional.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {!parsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                <FileSpreadsheet className="h-10 w-10 text-gray-400 mb-2" />
                <p className="text-sm font-medium">Download the Excel template</p>
                <p className="text-xs text-gray-500 mb-3">Items + Guide tabs with sample data</p>
                <Button variant="outline" size="sm" onClick={downloadItemTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <div className="p-4 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                <Upload className="h-10 w-10 text-gray-400 mb-2" />
                <p className="text-sm font-medium">Select your file</p>
                <p className="text-xs text-gray-500 mb-3">.xlsx or .xls — up to 5 MB</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleSelect}
                  id="bulk-items-file"
                  className="hidden"
                  disabled={importing}
                />
                <label htmlFor="bulk-items-file">
                  <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                    <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                  </Button>
                </label>
                {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
              </div>
            </div>
          )}

          {parsed && summary && !finalResult && !importing && (summary.toUpdate > 0 || summary.toInsert > 0) && (
            <div className="rounded-md border p-3 bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-blue-900">
                    {summary.toInsert} new · {summary.toUpdate} update{summary.toUpdate !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-blue-800">
                    Existing SKUs will be updated in place. Stock changes are recorded as adjustments on the Movement page.
                  </p>
                </div>
              </div>
            </div>
          )}
          {parsed && summary && !finalResult && !importing && summary.errorRows > 0 && (
            <div className="rounded-md border p-3 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-900">
                    {summary.errorRows} row{summary.errorRows !== 1 ? 's' : ''} with issues
                    {summary.valid > 0 ? ` · ${summary.valid} still importable` : ' — nothing to import'}
                  </p>
                  <p className="text-sm text-red-800">
                    {summary.valid > 0
                      ? 'Untick the failed rows below, or fix them in Excel and re-upload.'
                      : 'Fix the highlighted rows in your spreadsheet and re-upload.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {importing && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-medium text-blue-900">
                    Importing {doneCount} of {selectedRows.size}…
                  </p>
                  <Progress value={progressPct} className="h-1.5" />
                </div>
              </div>
            </div>
          )}

          {finalResult && !importing && (
            <div className={`rounded-md border p-3 ${
              finalResult.failed === 0 ? 'bg-green-50 border-green-200'
                : finalResult.ok === 0 ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                {finalResult.failed === 0 ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  : finalResult.ok === 0 ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {finalResult.failed === 0
                      ? `All ${finalResult.ok} item${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No items imported — all ${finalResult.failed} failed`
                        : `${finalResult.ok} imported · ${finalResult.failed} failed`}
                  </p>
                  {finalResult.failed > 0 && (
                    <p className="text-sm text-gray-700">Failed rows are highlighted below with the backend error message.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsed && parsed.items.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th className="px-2 py-2 w-8 text-center"></th>
                    <th className="px-2 py-2 w-8 text-center">Status</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Item</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                    <th className="text-left px-3 py-2 font-medium w-16">POS</th>
                    <th className="text-left px-3 py-2 font-medium w-16">Unit</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Cost</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Price</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Stock</th>
                    <th className="text-left px-3 py-2 font-medium w-28">Warehouse</th>
                    <th className="text-left px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.items.map(r => {
                    const prog = progress.get(r.rowNumber);
                    const hasErr = r.errors.length > 0;
                    const isCreated = prog?.status === 'created';
                    const isFailed = prog?.status === 'failed';
                    const isCreating = prog?.status === 'creating';
                    const rowBg = isFailed ? 'bg-red-50'
                      : isCreated ? 'bg-green-50'
                      : isCreating ? 'bg-blue-50'
                      : hasErr ? 'bg-red-50'
                      : '';
                    const checked = selectedRows.has(r.rowNumber);
                    return (
                      <tr key={r.rowNumber} className={`border-t ${rowBg}`}>
                        <td className={`px-2 py-2 text-center ${rowBg}`}>
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={checked}
                            disabled={hasErr || importing || isCreated}
                            onChange={() => toggleOne(r.rowNumber)}
                            aria-label={`Select row ${r.rowNumber}`}
                          />
                        </td>
                        <td className={`px-2 py-2 text-center ${rowBg}`}>
                          {isCreated ? <CheckCircle className="h-4 w-4 text-green-600 inline" />
                            : isFailed ? <AlertCircle className="h-4 w-4 text-red-600 inline" />
                            : isCreating ? <RefreshCw className="h-4 w-4 text-blue-600 inline animate-spin" />
                            : hasErr ? <AlertCircle className="h-4 w-4 text-red-600 inline" />
                            : <CheckCircle className="h-4 w-4 text-green-600 inline" />}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-600 space-y-1">
                          <div>{r.data.sku ?? ''}</div>
                          {!hasErr && (r.existingItemId
                            ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">Update</span>
                            : <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">New</span>)}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.data.name}</td>
                        <td className="px-3 py-2 text-gray-700">{r.data.itemCategory ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600 capitalize">{r.data.category ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data.unit ?? ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.data.unitCost != null ? r.data.unitCost.toFixed(2) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.data.unitPrice != null ? r.data.unitPrice.toFixed(2) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.existingItemId && r.data.stockQty != null && r.existingStockQty != null && r.data.stockQty !== r.existingStockQty ? (
                            <span title={`Delta: ${(r.data.stockQty - r.existingStockQty > 0 ? '+' : '')}${(r.data.stockQty - r.existingStockQty).toFixed(2)}`}>
                              <span className="text-gray-400">{r.existingStockQty}</span>
                              <span className="text-gray-400 mx-0.5">→</span>
                              <span className={r.data.stockQty > r.existingStockQty ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                                {r.data.stockQty}
                              </span>
                            </span>
                          ) : (
                            r.data.stockQty != null ? r.data.stockQty : ''
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.data.warehouseId
                            ? (warehouseNameById.get(r.data.warehouseId) ?? '—')
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 max-w-[240px]">
                          {isFailed ? (
                            <span className="text-red-700 block truncate" title={prog?.message}>
                              {prog?.message ?? 'Failed'}
                            </span>
                          ) : isCreated ? (
                            <span className="text-green-700 block">{r.existingItemId ? 'Updated' : 'Imported'}</span>
                          ) : r.errors.length > 0 ? (
                            <span className="text-red-700 block truncate" title={r.errors.join('\n')}>
                              {r.errors[0]}
                              {r.errors.length > 1 ? ` (+${r.errors.length - 1})` : ''}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-white sm:justify-between sm:items-center gap-3">
          <div className="text-xs">
            {finalResult ? (
              <span className={`inline-flex items-center gap-1 font-medium ${finalResult.failed === 0 ? 'text-green-700' : finalResult.ok === 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {finalResult.failed === 0 ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {finalResult.ok} imported · {finalResult.failed} failed
              </span>
            ) : summary && summary.errorRows > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.errorRows} failed
              </span>
            ) : null}
          </div>
          <div className="flex gap-2 flex-wrap">
            {parsed && !importing && (
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => { if (!importing) { reset(); onOpenChange(false); } }}
              disabled={importing}
            >
              {finalResult ? 'Close' : 'Cancel'}
            </Button>
            {!finalResult && (
              <Button
                onClick={handleImport}
                disabled={!parsed || parsed.totalItems === 0 || selectedRows.size === 0 || importing}
              >
                {importing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing… ({doneCount}/{selectedRows.size})
                  </>
                ) : (() => {
                  if (selectedRows.size === 0) return <>No items selected</>;
                  const sel = parsed?.items.filter(r => selectedRows.has(r.rowNumber)) ?? [];
                  const nUpd = sel.filter(r => r.existingItemId).length;
                  const nIns = sel.length - nUpd;
                  const parts: string[] = [];
                  if (nIns > 0) parts.push(`${nIns} new`);
                  if (nUpd > 0) parts.push(`${nUpd} update`);
                  return <><Upload className="h-4 w-4 mr-2" />Import ({parts.join(' + ')})</>;
                })()}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
