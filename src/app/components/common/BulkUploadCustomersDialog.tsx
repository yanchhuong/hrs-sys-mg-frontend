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
  parseCustomersExcel, downloadCustomerTemplate, toCustomerRequest,
  ParsedCustomerData,
} from '../../utils/customerBulkParser';
import * as customersApi from '../../api/customers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  /** Existing roster — feeds Name / TIN dupe detection at parse time. */
  existingCustomers?: customersApi.Customer[];
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
 * Bulk-import customers from an Excel workbook. One row per customer;
 * required-field enforcement mirrors CustomerService server-side so
 * an operator sees the same errors client-side that would otherwise
 * come back as 400s mid-import.
 */
export function BulkUploadCustomersDialog({
  open, onOpenChange, onImported, existingCustomers = [],
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedCustomerData | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!parsed) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(parsed.customers.filter(r => r.errors.length === 0).map(r => r.rowNumber)));
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
      const result = await parseCustomersExcel(f, existingCustomers);
      setParsed(result);
      const errorRows = result.customers.filter(r => r.errors.length > 0).length;
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else if (errorRows > 0) {
        toast.error(`${errorRows} row${errorRows !== 1 ? 's' : ''} have issues — review before import.`);
      } else if (result.totalCustomers > 0) {
        toast.success(`Ready to import ${result.validCustomers} customer${result.validCustomers !== 1 ? 's' : ''}`);
      } else {
        toast.error('No customer rows found in the workbook.');
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
    const rowsToImport = parsed.customers.filter(
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
        return customersApi.create(toCustomerRequest(row));
      },
      5, // matches the Items dialog — single-row records, no nesting.
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
          ? `Imported ${okCount} customer${okCount !== 1 ? 's' : ''}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No customers imported — every row failed. See the list for details.', { duration: 8000 });
    }
  };

  const summary = parsed ? {
    total: parsed.totalCustomers,
    valid: parsed.validCustomers,
    errorRows: parsed.customers.filter(r => r.errors.length > 0).length,
    warningRows: parsed.customers.filter(r => r.errors.length === 0 && r.warnings.length > 0).length,
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
            Upload Bulk Customers
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                  Upload an Excel file (.xlsx). One row per customer. Business rows require Business Type + Representative; taxable business rows additionally require a TIN.
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
                <p className="text-xs text-gray-500 mb-3">Customers + Guide tabs with sample data</p>
                <Button variant="outline" size="sm" onClick={downloadCustomerTemplate}>
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
                  id="bulk-customers-file"
                  className="hidden"
                  disabled={importing}
                />
                <label htmlFor="bulk-customers-file">
                  <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                    <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                  </Button>
                </label>
                {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
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

          {parsed && summary && summary.errorRows === 0 && summary.warningRows > 0 && !finalResult && !importing && (
            <div className="rounded-md border p-3 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-amber-900">
                    {summary.warningRows} row{summary.warningRows !== 1 ? 's' : ''} with warnings
                  </p>
                  <p className="text-sm text-amber-800">
                    Usually a repeat name that already exists in the roster. Rows still import — untick them below if unwanted.
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
                      ? `All ${finalResult.ok} customer${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No customers imported — all ${finalResult.failed} failed`
                        : `${finalResult.ok} imported · ${finalResult.failed} failed`}
                  </p>
                  {finalResult.failed > 0 && (
                    <p className="text-sm text-gray-700">Failed rows are highlighted below with the backend error message.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsed && parsed.customers.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th className="px-2 py-2 w-8 text-center"></th>
                    <th className="px-2 py-2 w-8 text-center">Status</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Phone</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Representative</th>
                    <th className="text-left px-3 py-2 font-medium">TIN</th>
                    <th className="text-left px-3 py-2 font-medium w-28">Business Type</th>
                    <th className="text-left px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.customers.map(r => {
                    const prog = progress.get(r.rowNumber);
                    const hasErr = r.errors.length > 0;
                    const hasWarn = !hasErr && r.warnings.length > 0;
                    const isCreated = prog?.status === 'created';
                    const isFailed = prog?.status === 'failed';
                    const isCreating = prog?.status === 'creating';
                    const rowBg = isFailed ? 'bg-red-50'
                      : isCreated ? 'bg-green-50'
                      : isCreating ? 'bg-blue-50'
                      : hasErr ? 'bg-red-50'
                      : hasWarn ? 'bg-amber-50'
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
                            : hasWarn ? <AlertTriangle className="h-4 w-4 text-amber-600 inline" />
                            : <CheckCircle className="h-4 w-4 text-green-600 inline" />}
                        </td>
                        <td className="px-3 py-2 text-gray-700 capitalize">{r.data.type}</td>
                        <td className="px-3 py-2 font-medium">{r.data.name}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data.phone ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data.email ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data.representative ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600 tabular-nums">{r.data.tin ?? ''}</td>
                        <td className="px-3 py-2 text-gray-600">{r.data.businessType ?? ''}</td>
                        <td className="px-3 py-2 max-w-[260px]">
                          {isFailed ? (
                            <span className="text-red-700 block truncate" title={prog?.message}>
                              {prog?.message ?? 'Failed'}
                            </span>
                          ) : isCreated ? (
                            <span className="text-green-700 block">Imported</span>
                          ) : r.errors.length > 0 ? (
                            <span className="text-red-700 block truncate" title={r.errors.join('\n')}>
                              {r.errors[0]}
                              {r.errors.length > 1 ? ` (+${r.errors.length - 1})` : ''}
                            </span>
                          ) : r.warnings.length > 0 ? (
                            <span className="text-amber-700 block truncate" title={r.warnings.join('\n')}>
                              {r.warnings[0]}
                              {r.warnings.length > 1 ? ` (+${r.warnings.length - 1})` : ''}
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
                disabled={!parsed || parsed.totalCustomers === 0 || selectedRows.size === 0 || importing}
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
                      ? 'No customers selected'
                      : `Import ${selectedRows.size} Customer${selectedRows.size !== 1 ? 's' : ''}`}
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
