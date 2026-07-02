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
  parseBillsExcel, downloadBillTemplate, toBillRequest,
  buildAutoCreateVendorRequest, isImportable,
  ParsedBillData, ParsedBill,
} from '../../utils/billBulkParser';
import * as billsApi from '../../api/bills';
import * as vendorsApi from '../../api/vendors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  /** Vendor roster used to resolve Name/TIN → vendorId. */
  vendors: vendorsApi.Vendor[];
  /** Bill numbers already in the tenant's system — parser flags
   *  collisions before the operator hits Import, so a DB unique-
   *  constraint error surfaces client-side rather than mid-import. */
  existingBillNos?: string[];
}

type RowStatus = 'pending' | 'creating' | 'created' | 'failed';
interface RowProgress {
  rowNumber: number;
  status: RowStatus;
  message?: string;
}

/** Pool-of-N concurrent async runner. Same behaviour as the Invoice
 *  and Employee bulk uploaders — kept local rather than shared so
 *  each dialog can be tuned independently. */
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
 * Bulk-import bills from an Excel workbook. Purchase-side twin of
 * {@code BulkUploadInvoicesDialog} — same layout, same auto-create
 * flow, resolves against Vendors instead of Customers.
 */
export function BulkUploadBillsDialog({
  open, onOpenChange, onImported, vendors, existingBillNos = [],
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedBillData | null>(null);
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
      parsed.bills.filter(b => isImportable(b, autoCreateVendors)).map(b => b.rowNumber),
    ));
  }, [parsed, autoCreateVendors]);

  // Missing vendor count — unique names, not row occurrences (matches
  // the "N vendor(s) created" the importer's dedup cache will actually
  // fire on submit).
  const unresolvedCount = parsed
    ? parsed.bills.filter(b => b.unresolvedVendor?.isFirstMention).length
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
      const result = await parseBillsExcel(f, vendors, existingBillNos);
      setParsed(result);
      const errorBills = result.bills.filter(b => b.errors.length > 0).length;
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else if (errorBills > 0) {
        toast.error(`${errorBills} bill${errorBills !== 1 ? 's' : ''} have issues — review before import.`);
      } else if (result.totalBills > 0) {
        toast.success(`Ready to import ${result.validBills} bill${result.validBills !== 1 ? 's' : ''}`);
      } else {
        toast.error('No bill rows found in the workbook.');
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
    const rowsToImport = parsed.bills.filter(
      b => selectedRows.has(b.rowNumber) && isImportable(b, autoCreateVendors),
    );
    if (rowsToImport.length === 0) {
      toast.error('Select at least one valid bill to import.');
      return;
    }

    const initial = new Map<number, RowProgress>(
      rowsToImport.map(b => [b.rowNumber, { rowNumber: b.rowNumber, status: 'pending' as const }]),
    );
    setProgress(initial);
    setImporting(true);

    // Dedup vendor creates by lowercased name — two bills that reference
    // the same missing vendor spawn ONE new record, not two. Mirrors
    // the Invoice dialog's customer-dedup cache.
    const createdVendorIds = new Map<string, string>();
    const inflightVendors = new Map<string, Promise<string>>();
    let vendorsCreated = 0;

    const resolveVendorId = async (bill: ParsedBill): Promise<string> => {
      if (bill.vendorId) return bill.vendorId;
      if (!bill.unresolvedVendor) {
        throw new Error('Row is missing vendor information.');
      }
      const key = bill.unresolvedVendor.name.trim().toLowerCase();
      const cached = createdVendorIds.get(key);
      if (cached) return cached;
      const inflight = inflightVendors.get(key);
      if (inflight) return inflight;
      const p = (async () => {
        const created = await vendorsApi.create(buildAutoCreateVendorRequest(bill));
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
        // billsApi.create doesn't take a notifyTelegram flag — bills
        // aren't customer-facing, so no auto-notification concern.
        // Cast around the legacy `customerId` typing on BillRequest;
        // the payload actually carries `vendorId`, which the backend
        // expects (see toBillRequest note).
        return billsApi.create(toBillRequest(row, vendorId) as unknown as billsApi.BillRequest);
      },
      // 3 concurrent creates — each bill is a multi-item transaction,
      // matches the Invoice-side cap so backend contention stays flat
      // when the operator imports both sides in parallel.
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
          ? `Imported ${okCount} bill${okCount !== 1 ? 's' : ''}${suffix}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed${suffix}`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No bills imported — every row failed. See the list for details.', { duration: 8000 });
    }
  };

  const summary = parsed ? {
    total: parsed.totalBills,
    valid: parsed.bills.filter(b => isImportable(b, autoCreateVendors)).length,
    errorBills: parsed.bills.filter(b => b.errors.length > 0).length,
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
            Upload Bulk Bills
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Upload an Excel file (.xlsx). Each header row (Issue Date + Bill No.) starts a new bill; blank-header rows below become extra line items on the same bill.
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
                <p className="text-xs text-gray-500 mb-3">Bill + Guide tabs with sample data</p>
                <Button variant="outline" size="sm" onClick={downloadBillTemplate}>
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
                  id="bulk-bills-file"
                  className="hidden"
                  disabled={importing}
                />
                <label htmlFor="bulk-bills-file">
                  <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                    <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                  </Button>
                </label>
                {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
              </div>
            </div>
          )}

          {parsed && summary && !finalResult && !importing && summary.errorBills > 0 && (
            <div className="rounded-md border p-3 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-900">
                    {summary.errorBills} bill{summary.errorBills !== 1 ? 's' : ''} with issues
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
                        Rows with a TIN are added as Business vendors (TIN + representative required by the service); TIN-less rows become Individual vendors. Duplicate names in the file share a single created record.
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
                      ? `All ${finalResult.ok} bill${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No bills imported — all ${finalResult.failed} failed`
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

          {parsed && parsed.bills.length > 0 && (
            <div className="space-y-2">
              {parsed.bills.map(bill => (
                <BillCard
                  key={bill.rowNumber}
                  bill={bill}
                  progress={progress.get(bill.rowNumber)}
                  selected={selectedRows.has(bill.rowNumber)}
                  onToggle={() => toggleOne(bill.rowNumber)}
                  disabled={
                    importing
                    || !isImportable(bill, autoCreateVendors)
                    || progress.get(bill.rowNumber)?.status === 'created'
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
            ) : summary && summary.errorBills > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.errorBills} failed
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
                disabled={!parsed || parsed.totalBills === 0 || selectedRows.size === 0 || importing}
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
                      ? 'No bills selected'
                      : `Import ${selectedRows.size} Bill${selectedRows.size !== 1 ? 's' : ''}`}
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

function BillCard({
  bill, progress, selected, onToggle, disabled, autoCreateVendors,
}: {
  bill: ParsedBill;
  progress?: RowProgress;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  autoCreateVendors: boolean;
}) {
  const hasErr = bill.errors.length > 0;
  const isFirstNewMention  = !!bill.unresolvedVendor?.isFirstMention;
  const isSharedNewMention = !!bill.unresolvedVendor && !isFirstNewMention;
  const willAutoCreate = isFirstNewMention && autoCreateVendors;
  const blockedByVendor = !!bill.unresolvedVendor && !autoCreateVendors;
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
          aria-label={`Select bill row ${bill.rowNumber}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {bill.data.billNo || <span className="text-gray-400">(no number)</span>}
            </span>
            {bill.data.kind && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border">
                {bill.data.kind === 'tax' ? 'Tax'
                  : bill.data.kind === 'commercial' ? 'Commercial'
                  : bill.data.kind === 'credit_note' ? 'Credit Note'
                  : 'Debit Note'}
              </span>
            )}
            {bill.data.currency && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border">
                {bill.data.currency}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {bill.data.vendorName || <em>(no vendor)</em>}
            </span>
            {willAutoCreate && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
                title="This vendor isn't in the roster yet — a new record will be created before the bill."
              >
                + New
              </span>
            )}
            {isSharedNewMention && autoCreateVendors && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
                title="Same new vendor as an earlier row — the importer creates the vendor once and links every bill to it."
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
          <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
            <span>Issue: {bill.data.issueDate ?? '—'}</span>
            <span>Due: {bill.data.dueDate ?? '—'}</span>
            {bill.data.taxType && <span>Tax: {bill.data.taxType}</span>}
            <span>Row {bill.rowNumber}</span>
          </div>

          {bill.data.items.length > 0 && (
            <table className="mt-2 w-full text-[11px] table-fixed">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left font-normal w-8">#</th>
                  <th className="text-left font-normal">Item</th>
                  <th className="text-left font-normal">Specification</th>
                  <th className="text-right font-normal w-14">Qty</th>
                  <th className="text-left font-normal w-16">Unit</th>
                  <th className="text-right font-normal w-20">Unit Price</th>
                  <th className="text-right font-normal w-20">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.data.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="py-1 text-gray-500">{idx + 1}</td>
                    <td className="py-1">{it.name}</td>
                    <td className="py-1 text-gray-600 truncate">{it.description ?? ''}</td>
                    <td className="py-1 text-right tabular-nums">{it.quantity}</td>
                    <td className="py-1">{it.unit ?? ''}</td>
                    <td className="py-1 text-right tabular-nums">{it.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-1 text-right tabular-nums">
                      {(it.quantity * it.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(isFailed && progress?.message) && (
            <div className="mt-2 text-[11px] text-red-700">
              <strong>Failed:</strong> {progress.message}
            </div>
          )}
          {isCreated && (
            <div className="mt-2 text-[11px] text-green-700">Imported.</div>
          )}
          {!isCreated && !isFailed && bill.errors.length > 0 && (
            <ul className="mt-2 text-[11px] text-red-700 list-disc list-inside space-y-0.5">
              {bill.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
