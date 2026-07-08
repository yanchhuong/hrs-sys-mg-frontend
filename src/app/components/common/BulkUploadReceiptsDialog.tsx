import { useEffect, useState } from 'react';
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
import { Checkbox } from '../ui/checkbox';
import {
  parseReceiptsExcel, downloadReceiptTemplate, toReceiptRequest,
  buildAutoCreateVendorRequest, isImportable,
  ParsedReceiptData, ParsedReceipt,
} from '../../utils/receiptBulkParser';
import * as receiptsApi from '../../api/receipts';
import * as vendorsApi from '../../api/vendors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  vendors: vendorsApi.Vendor[];
  /** Receipt numbers already in the tenant's system — parser flags
   *  collisions client-side so no DB unique-constraint error surprises
   *  mid-import. */
  existingReceiptNos?: string[];
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
 * Bulk-import receipts from an Excel workbook. Simpler shape than the
 * Bills/Invoices dialogs — one row per receipt, no line-item accordion.
 */
export function BulkUploadReceiptsDialog({
  open, onOpenChange, onImported, vendors, existingReceiptNos = [],
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedReceiptData | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number; vendorsCreated: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [autoCreateVendors, setAutoCreateVendors] = useState(true);

  useEffect(() => {
    if (!parsed) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(
      parsed.receipts.filter(r => isImportable(r, autoCreateVendors)).map(r => r.rowNumber),
    ));
  }, [parsed, autoCreateVendors]);

  const unresolvedCount = parsed
    ? parsed.receipts.filter(r => r.unresolvedVendor?.isFirstMention).length
    : 0;

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
      const result = await parseReceiptsExcel(f, vendors, existingReceiptNos);
      setParsed(result);
      const errorReceipts = result.receipts.filter(r => r.errors.length > 0).length;
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else if (errorReceipts > 0) {
        toast.error(`${errorReceipts} expense${errorReceipts !== 1 ? 's' : ''} have issues — review before import.`);
      } else if (result.totalReceipts > 0) {
        toast.success(`Ready to import ${result.validReceipts} expense${result.validReceipts !== 1 ? 's' : ''}`);
      } else {
        toast.error('No expense rows found in the workbook.');
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
    const rowsToImport = parsed.receipts.filter(
      r => selectedRows.has(r.rowNumber) && isImportable(r, autoCreateVendors),
    );
    if (rowsToImport.length === 0) {
      toast.error('Select at least one valid expense to import.');
      return;
    }

    const initial = new Map<number, RowProgress>(
      rowsToImport.map(r => [r.rowNumber, { rowNumber: r.rowNumber, status: 'pending' as const }]),
    );
    setProgress(initial);
    setImporting(true);

    // Same dedup-by-name cache as the Bills dialog.
    const createdVendorIds = new Map<string, string>();
    const inflightVendors = new Map<string, Promise<string>>();
    let vendorsCreated = 0;

    const resolveVendorId = async (r: ParsedReceipt): Promise<string> => {
      if (r.vendorId) return r.vendorId;
      if (!r.unresolvedVendor) {
        throw new Error('Row is missing vendor information.');
      }
      const key = r.unresolvedVendor.name.trim().toLowerCase();
      const cached = createdVendorIds.get(key);
      if (cached) return cached;
      const inflight = inflightVendors.get(key);
      if (inflight) return inflight;
      const p = (async () => {
        const created = await vendorsApi.create(buildAutoCreateVendorRequest(r));
        createdVendorIds.set(key, created.id);
        vendorsCreated++;
        return created.id;
      })();
      inflightVendors.set(key, p);
      try {
        return await p;
      } finally {
        inflightVendors.delete(key);
      }
    };

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
        const vendorId = await resolveVendorId(row);
        return receiptsApi.create(toReceiptRequest(row, vendorId));
      },
      3,
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
    setFinalResult({ ok: okCount, failed: failCount, vendorsCreated });

    if (okCount > 0) {
      onImported();
      const suffix = vendorsCreated > 0
        ? ` (+${vendorsCreated} vendor${vendorsCreated !== 1 ? 's' : ''} created)`
        : '';
      toast.success(
        failCount === 0
          ? `Imported ${okCount} expense${okCount !== 1 ? 's' : ''}${suffix}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed${suffix}`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No expenses imported — every row failed. See the list for details.', { duration: 8000 });
    }
  };

  const summary = parsed ? {
    total: parsed.totalReceipts,
    valid: parsed.receipts.filter(r => isImportable(r, autoCreateVendors)).length,
    errorReceipts: parsed.receipts.filter(r => r.errors.length > 0).length,
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
      <DialogContent className="max-w-4xl flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Bulk Expenses
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Upload an Excel file (.xlsx). One row per expense — expenses don't have line items.
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
                <p className="text-xs text-gray-500 mb-3">Expense + Guide tabs with sample data</p>
                <Button variant="outline" size="sm" onClick={downloadReceiptTemplate}>
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
                  id="bulk-receipts-file"
                  className="hidden"
                  disabled={importing}
                />
                <label htmlFor="bulk-receipts-file">
                  <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                    <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                  </Button>
                </label>
                {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
              </div>
            </div>
          )}

          {parsed && summary && !finalResult && !importing && summary.errorReceipts > 0 && (
            <div className="rounded-md border p-3 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-900">
                    {summary.errorReceipts} receipt{summary.errorReceipts !== 1 ? 's' : ''} with issues
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

          {parsed && unresolvedCount > 0 && !finalResult && !importing && (
            <div className={`rounded-md border p-3 ${
              autoCreateVendors ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={autoCreateVendors}
                  onCheckedChange={(v) => setAutoCreateVendors(v === true)}
                />
                <p className={`font-medium text-sm inline-flex items-center gap-1.5 ${
                  autoCreateVendors ? 'text-blue-900' : 'text-amber-900'
                }`}>
                  Auto-create {unresolvedCount} missing vendor{unresolvedCount !== 1 ? 's' : ''} during import
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`inline-flex items-center cursor-help ${
                          autoCreateVendors ? 'text-blue-500 hover:text-blue-700' : 'text-amber-500 hover:text-amber-700'
                        }`}>
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        Rows with a TIN are added as Business vendors; TIN-less rows become Individual vendors. Duplicate names in the file share a single created record.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
              </label>
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
                      ? `All ${finalResult.ok} expense${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No expenses imported — all ${finalResult.failed} failed`
                        : `${finalResult.ok} imported · ${finalResult.failed} failed`}
                    {finalResult.vendorsCreated > 0 && (
                      <span className="text-gray-700 font-normal">
                        {' '}· {finalResult.vendorsCreated} new vendor{finalResult.vendorsCreated !== 1 ? 's' : ''} added
                      </span>
                    )}
                  </p>
                  {finalResult.failed > 0 && (
                    <p className="text-sm text-gray-700">Failed rows are highlighted below with the backend error message.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsed && parsed.receipts.length > 0 && (
            <div className="space-y-2">
              {parsed.receipts.map(r => (
                <ReceiptCard
                  key={r.rowNumber}
                  receipt={r}
                  progress={progress.get(r.rowNumber)}
                  selected={selectedRows.has(r.rowNumber)}
                  onToggle={() => toggleOne(r.rowNumber)}
                  disabled={
                    importing
                    || !isImportable(r, autoCreateVendors)
                    || progress.get(r.rowNumber)?.status === 'created'
                  }
                  autoCreateVendors={autoCreateVendors}
                />
              ))}
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
            ) : summary && summary.errorReceipts > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.errorReceipts} failed
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
                disabled={!parsed || parsed.totalReceipts === 0 || selectedRows.size === 0 || importing}
              >
                {importing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing… ({doneCount}/{selectedRows.size})
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {selectedRows.size === 0
                      ? 'No receipts selected'
                      : `Import ${selectedRows.size} Receipt${selectedRows.size !== 1 ? 's' : ''}`}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptCard({
  receipt, progress, selected, onToggle, disabled, autoCreateVendors,
}: {
  receipt: ParsedReceipt;
  progress?: RowProgress;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  autoCreateVendors: boolean;
}) {
  const hasErr = receipt.errors.length > 0;
  const isFirstNewMention  = !!receipt.unresolvedVendor?.isFirstMention;
  const isSharedNewMention = !!receipt.unresolvedVendor && !isFirstNewMention;
  const willAutoCreate = isFirstNewMention && autoCreateVendors;
  const blockedByVendor = !!receipt.unresolvedVendor && !autoCreateVendors;
  const isCreated = progress?.status === 'created';
  const isFailed = progress?.status === 'failed';
  const isCreating = progress?.status === 'creating';

  const tone = isFailed || hasErr ? 'red'
    : isCreated ? 'green'
    : isCreating ? 'blue'
    : blockedByVendor ? 'amber'
    : willAutoCreate ? 'indigo'
    : isSharedNewMention && autoCreateVendors ? 'indigo-soft'
    : 'gray';
  const border =
    tone === 'red'         ? 'border-red-200 bg-red-50/40'
    : tone === 'green'       ? 'border-green-200 bg-green-50/40'
    : tone === 'blue'        ? 'border-blue-200 bg-blue-50/40'
    : tone === 'amber'       ? 'border-amber-200 bg-amber-50/40'
    : tone === 'indigo'      ? 'border-indigo-200 bg-indigo-50/40'
    : tone === 'indigo-soft' ? 'border-indigo-100 bg-indigo-50/20'
    : 'border-gray-200';

  return (
    <div className={`rounded-md border p-3 ${border}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`Select receipt row ${receipt.rowNumber}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {receipt.data.receiptNo || <span className="text-gray-400">(no number)</span>}
            </span>
            {receipt.data.currency && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border">
                {receipt.data.currency}
              </span>
            )}
            {receipt.data.amount != null && (
              <span className="text-xs text-gray-700 tabular-nums font-medium">
                {receipt.data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {receipt.data.vendorName || <em>(no vendor)</em>}
            </span>
            {willAutoCreate && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
                title="This vendor isn't in the roster yet — a new record will be created before the expense."
              >
                + New
              </span>
            )}
            {isSharedNewMention && autoCreateVendors && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
                title="Same new vendor as an earlier row — the importer creates the vendor once and links every expense to it."
              >
                ↳ Shared
              </span>
            )}
            {blockedByVendor && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200"
                title="Vendor not found. Tick 'Auto-create missing vendors' above, or add the vendor manually first."
              >
                Vendor missing
              </span>
            )}
            {isCreated ? <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
              : isFailed ? <AlertCircle className="h-4 w-4 text-red-600 ml-auto" />
              : isCreating ? <RefreshCw className="h-4 w-4 text-blue-600 animate-spin ml-auto" />
              : hasErr ? <AlertCircle className="h-4 w-4 text-red-600 ml-auto" />
              : <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />}
          </div>
          <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500 flex-wrap">
            <span>Issue: {receipt.data.issueDate ?? '—'}</span>
            {receipt.data.supplierType && (
              <span>Supplier: {
                receipt.data.supplierType === 'taxable_person' ? 'Taxable'
                : receipt.data.supplierType === 'non_taxable'  ? 'Non-Taxable'
                : 'Non-Resident'
              }</span>
            )}
            {receipt.data.taxType && <span>WHT: {receipt.data.taxType} ({(receipt.data.taxAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>}
            {receipt.data.exchangeRate != null && receipt.data.exchangeRate !== 1 && (
              <span>FX: {receipt.data.exchangeRate}</span>
            )}
            <span>Row {receipt.rowNumber}</span>
          </div>

          {(isFailed && progress?.message) && (
            <div className="mt-2 text-[11px] text-red-700">
              <strong>Failed:</strong> {progress.message}
            </div>
          )}
          {isCreated && (
            <div className="mt-2 text-[11px] text-green-700">Imported.</div>
          )}
          {!isCreated && !isFailed && receipt.errors.length > 0 && (
            <ul className="mt-2 text-[11px] text-red-700 list-disc list-inside space-y-0.5">
              {receipt.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
