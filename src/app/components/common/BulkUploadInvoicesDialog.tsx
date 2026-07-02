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
import {
  parseInvoicesExcel, downloadInvoiceTemplate, toInvoiceRequest,
  buildAutoCreateCustomerRequest, isImportable,
  ParsedInvoiceData, ParsedInvoice,
} from '../../utils/invoiceBulkParser';
import * as invoicesApi from '../../api/invoices';
import * as customersApi from '../../api/customers';
import { Checkbox } from '../ui/checkbox';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  /** Customer roster used to resolve Name/TIN → customerId. Passed
   *  from the parent so the dialog doesn't have to re-fetch on open. */
  customers: customersApi.Customer[];
  /** Invoice numbers already in the tenant's system. The parser
   *  compares every file row against this set and flags collisions
   *  before the operator hits Import, so the DB unique-constraint
   *  error surfaces client-side instead of mid-import. */
  existingInvoiceNos?: string[];
}

type RowStatus = 'pending' | 'creating' | 'created' | 'failed';
interface RowProgress {
  rowNumber: number;
  status: RowStatus;
  message?: string;
}

/** Pool-of-N concurrent async runner — copied from the Employee
 *  bulk uploader so behaviour stays symmetric across import surfaces. */
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
 * Bulk-import invoices from an Excel workbook. Same shape as
 * BulkUploadEmployeesDialog — download template, pick file, preview,
 * import — adapted for the invoice's nested Header + Items layout
 * so the operator can see line items grouped under each invoice.
 */
export function BulkUploadInvoicesDialog({ open, onOpenChange, onImported, customers, existingInvoiceNos = [] }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedInvoiceData | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number; customersCreated: number } | null>(null);
  // Which invoices the operator wants to import. Seeded to every
  // importable row after parse; rows with hard errors are never
  // checked, and rows with only an unresolved-customer warning are
  // gated on the auto-create toggle below.
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  // When ON, the importer creates a fresh customer (type=business)
  // for every row whose Excel Name/TIN didn't match the roster,
  // then uses the returned id on the invoice create. Defaults on
  // whenever a parse turns up at least one unresolved customer,
  // so the operator lands in "one-click import" mode.
  const [autoCreateCustomers, setAutoCreateCustomers] = useState(true);

  useEffect(() => {
    if (!parsed) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(
      parsed.invoices.filter(r => isImportable(r, autoCreateCustomers)).map(r => r.rowNumber),
    ));
  }, [parsed, autoCreateCustomers]);

  // "Missing customers" count = unique names, not row occurrences.
  // A file with 3 invoices for the same new customer counts as 1,
  // matching the single customer create the importer will fire.
  const unresolvedCount = parsed
    ? parsed.invoices.filter(i => i.unresolvedCustomer?.isFirstMention).length
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
      const result = await parseInvoicesExcel(f, customers, existingInvoiceNos);
      setParsed(result);
      const errorInvoices = result.invoices.filter(i => i.errors.length > 0).length;
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else if (errorInvoices > 0) {
        toast.error(`${errorInvoices} invoice${errorInvoices !== 1 ? 's' : ''} have issues — review before import.`);
      } else if (result.totalInvoices > 0) {
        toast.success(`Ready to import ${result.validInvoices} invoice${result.validInvoices !== 1 ? 's' : ''}`);
      } else {
        toast.error('No invoice rows found in the workbook.');
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
    const rowsToImport = parsed.invoices.filter(
      r => selectedRows.has(r.rowNumber) && isImportable(r, autoCreateCustomers),
    );
    if (rowsToImport.length === 0) {
      toast.error('Select at least one valid invoice to import.');
      return;
    }

    const initial = new Map<number, RowProgress>(
      rowsToImport.map(r => [r.rowNumber, { rowNumber: r.rowNumber, status: 'pending' as const }]),
    );
    setProgress(initial);
    setImporting(true);

    // Dedup customer creates by lowercase name so two invoices sharing
    // the same missing customer only spawn ONE new record. The first
    // row to touch a name pays for the create; the rest read the id
    // out of this cache. Populated as rows land, guarded by a lock
    // so two concurrent workers can't race a duplicate insert.
    const createdCustomerIds = new Map<string, string>();
    const inflightCustomers = new Map<string, Promise<string>>();
    let customersCreated = 0;

    const resolveCustomerId = async (row: ParsedInvoice): Promise<string> => {
      if (row.customerId) return row.customerId;
      if (!row.unresolvedCustomer) {
        throw new Error('Row is missing customer information.');
      }
      const key = row.unresolvedCustomer.name.trim().toLowerCase();
      const cached = createdCustomerIds.get(key);
      if (cached) return cached;
      const inflight = inflightCustomers.get(key);
      if (inflight) return inflight;
      const p = (async () => {
        const created = await customersApi.create(buildAutoCreateCustomerRequest(row));
        createdCustomerIds.set(key, created.id);
        customersCreated++;
        return created.id;
      })();
      inflightCustomers.set(key, p);
      try {
        return await p;
      } finally {
        inflightCustomers.delete(key);
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
        const customerId = await resolveCustomerId(row);
        // notifyTelegram=false — bulk imports shouldn't spray customer
        // Telegrams retroactively. Operator can trigger sends manually.
        return invoicesApi.create(toInvoiceRequest(row, customerId), false);
      },
      // 3 concurrent creates — each invoice is a multi-item transaction,
      // so a lower cap keeps the DB from thrashing under a large paste.
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
    setFinalResult({ ok: okCount, failed: failCount, customersCreated });

    if (okCount > 0) {
      onImported();
      const suffix = customersCreated > 0
        ? ` (+${customersCreated} customer${customersCreated !== 1 ? 's' : ''} created)`
        : '';
      toast.success(
        failCount === 0
          ? `Imported ${okCount} invoice${okCount !== 1 ? 's' : ''}${suffix}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed${suffix}`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No invoices imported — every row failed. See the list for details.', { duration: 8000 });
    }
  };

  const summary = parsed ? {
    total: parsed.totalInvoices,
    // "Valid" reflects what CAN import under the current toggle state:
    // rows without hard errors, plus unresolved-customer rows when
    // auto-create is on. Tracks the checkbox pool the operator sees.
    valid: parsed.invoices.filter(r => isImportable(r, autoCreateCustomers)).length,
    errorInvoices: parsed.invoices.filter(r => r.errors.length > 0).length,
    unresolvedCustomers: unresolvedCount,
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
            Upload Bulk Invoices
            {/* Info icon replaces the always-on description paragraph
                so the header stays compact once the operator learns
                the workbook shape. */}
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Upload an Excel file (.xlsx). Each header row (Issue Date + Invoice No.) starts a new invoice; blank-header rows below become extra line items on the same invoice.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template + file picker — collapsed once a file has been
              parsed so the preview list takes the whole scroll region.
              The Reset button in the footer wipes `parsed` and brings
              these cards back. */}
          {!parsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                <FileSpreadsheet className="h-10 w-10 text-gray-400 mb-2" />
                <p className="text-sm font-medium">Download the Excel template</p>
                <p className="text-xs text-gray-500 mb-3">Invoice + Guide tabs with sample data</p>
                <Button variant="outline" size="sm" onClick={downloadInvoiceTemplate}>
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
                  id="bulk-invoices-file"
                  className="hidden"
                  disabled={importing}
                />
                <label htmlFor="bulk-invoices-file">
                  <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                    <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                  </Button>
                </label>
                {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
              </div>
            </div>
          )}

          {/* Error banner — only shown when the parse turned up at
              least one blocking issue. The all-clean case is silent:
              the import button + green preview cards already signal
              "ready to import". */}
          {parsed && summary && !finalResult && !importing && summary.errorInvoices > 0 && (
            <div className="rounded-md border p-3 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-900">
                    {summary.errorInvoices} invoice{summary.errorInvoices !== 1 ? 's' : ''} with issues
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

          {/* Auto-create toggle — only appears when the parse turned up
              at least one unresolved customer. Ticking it moves those
              rows out of the "blocked" pile and instructs the importer
              to create fresh business customers ahead of the invoice
              POST. */}
          {parsed && unresolvedCount > 0 && !finalResult && !importing && (
            <div className={`rounded-md border p-3 ${
              autoCreateCustomers ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={autoCreateCustomers}
                  onCheckedChange={(v) => setAutoCreateCustomers(v === true)}
                />
                <p className={`font-medium text-sm inline-flex items-center gap-1.5 ${
                  autoCreateCustomers ? 'text-blue-900' : 'text-amber-900'
                }`}>
                  Auto-create {unresolvedCount} missing customer{unresolvedCount !== 1 ? 's' : ''} during import
                  {/* Info tooltip replaces the paragraph-under-the-label
                      so the banner stays a single tidy line. Copy still
                      spells out the Business/Taxable classification rule
                      the importer follows. */}
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`inline-flex items-center cursor-help ${
                          autoCreateCustomers ? 'text-blue-500 hover:text-blue-700' : 'text-amber-500 hover:text-amber-700'
                        }`}>
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        New customers will be added as Business (Taxable when TIN is present, otherwise Non-taxable). Duplicate names in the file share a single created record.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
              </label>
            </div>
          )}

          {/* In-progress banner */}
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

          {/* Final result banner */}
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
                      ? `All ${finalResult.ok} invoice${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No invoices imported — all ${finalResult.failed} failed`
                        : `${finalResult.ok} imported · ${finalResult.failed} failed`}
                    {finalResult.customersCreated > 0 && (
                      <span className="text-gray-700 font-normal">
                        {' '}· {finalResult.customersCreated} new customer{finalResult.customersCreated !== 1 ? 's' : ''} added
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

          {/* Preview cards — one per invoice, items nested inside */}
          {parsed && parsed.invoices.length > 0 && (
            <div className="space-y-2">
              {parsed.invoices.map(inv => (
                <InvoiceCard
                  key={inv.rowNumber}
                  invoice={inv}
                  progress={progress.get(inv.rowNumber)}
                  selected={selectedRows.has(inv.rowNumber)}
                  onToggle={() => toggleOne(inv.rowNumber)}
                  disabled={
                    importing
                    || !isImportable(inv, autoCreateCustomers)
                    || progress.get(inv.rowNumber)?.status === 'created'
                  }
                  autoCreateCustomers={autoCreateCustomers}
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
            ) : summary && summary.errorInvoices > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.errorInvoices} failed
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
                disabled={!parsed || parsed.totalInvoices === 0 || selectedRows.size === 0 || importing}
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
                      ? 'No invoices selected'
                      : `Import ${selectedRows.size} Invoice${selectedRows.size !== 1 ? 's' : ''}`}
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

/** Compact preview card for one parsed invoice — header on top,
 *  line items in a right-aligned table, per-row status badge. */
function InvoiceCard({
  invoice, progress, selected, onToggle, disabled, autoCreateCustomers,
}: {
  invoice: ParsedInvoice;
  progress?: RowProgress;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
  autoCreateCustomers: boolean;
}) {
  const hasErr = invoice.errors.length > 0;
  // Distinguish the FIRST row that introduces each new customer name
  // from FOLLOW-UP rows that reuse it. The first mention drives the
  // "N new customers" tally; follow-ups get a muted "shared" badge
  // so the operator sees the grouping without inflating the count.
  const isFirstNewMention  = !!invoice.unresolvedCustomer?.isFirstMention;
  const isSharedNewMention = !!invoice.unresolvedCustomer && !isFirstNewMention;
  const willAutoCreate = isFirstNewMention && autoCreateCustomers;
  const blockedByCustomer = !!invoice.unresolvedCustomer && !autoCreateCustomers;
  const isCreated = progress?.status === 'created';
  const isFailed = progress?.status === 'failed';
  const isCreating = progress?.status === 'creating';

  const tone = isFailed || hasErr ? 'red'
    : isCreated ? 'green'
    : isCreating ? 'blue'
    : blockedByCustomer ? 'amber'
    : willAutoCreate ? 'indigo'
    : isSharedNewMention && autoCreateCustomers ? 'indigo-soft'
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
          aria-label={`Select invoice row ${invoice.rowNumber}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {invoice.data.invoiceNo || <span className="text-gray-400">(no number)</span>}
            </span>
            {invoice.data.kind && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border">
                {invoice.data.kind === 'tax' ? 'Tax'
                  : invoice.data.kind === 'commercial' ? 'Commercial'
                  : invoice.data.kind === 'credit_note' ? 'Credit Note'
                  : 'Debit Note'}
              </span>
            )}
            {invoice.data.currency && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 border">
                {invoice.data.currency}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {invoice.data.customerName || <em>(no customer)</em>}
            </span>
            {/* First row that introduces a new customer — bold indigo. */}
            {willAutoCreate && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
                title="This customer isn't in the roster yet — a new Business record will be created before the invoice."
              >
                + New
              </span>
            )}
            {/* Follow-up row that reuses the same new customer. Muted
                so the operator's eye still counts one "+ New" per
                unique customer, while the grouping stays visible. */}
            {isSharedNewMention && autoCreateCustomers && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
                title="Same new customer as an earlier row — the importer creates the customer once and links every invoice to it."
              >
                ↳ Shared
              </span>
            )}
            {blockedByCustomer && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200"
                title="Customer not found. Tick 'Auto-create missing customers' above, or add the customer manually first."
              >
                Customer missing
              </span>
            )}
            {isCreated ? <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
              : isFailed ? <AlertCircle className="h-4 w-4 text-red-600 ml-auto" />
              : isCreating ? <RefreshCw className="h-4 w-4 text-blue-600 animate-spin ml-auto" />
              : hasErr ? <AlertCircle className="h-4 w-4 text-red-600 ml-auto" />
              : <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />}
          </div>
          <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
            <span>Issue: {invoice.data.issueDate ?? '—'}</span>
            <span>Due: {invoice.data.dueDate ?? '—'}</span>
            {invoice.data.taxType && <span>Tax: {invoice.data.taxType}</span>}
            <span>Row {invoice.rowNumber}</span>
          </div>

          {invoice.data.items.length > 0 && (
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
                {invoice.data.items.map((it, idx) => (
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
          {!isCreated && !isFailed && invoice.errors.length > 0 && (
            <ul className="mt-2 text-[11px] text-red-700 list-disc list-inside space-y-0.5">
              {invoice.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          {!isCreated && !isFailed && invoice.warnings.length > 0 && (
            <ul className="mt-1 text-[11px] text-amber-700 list-disc list-inside space-y-0.5">
              {invoice.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
