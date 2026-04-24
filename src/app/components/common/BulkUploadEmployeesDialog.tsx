import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Progress } from '../ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  FileSpreadsheet, Upload, Download, AlertCircle, AlertTriangle, CheckCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Employee } from '../../types/hrms';
import { mockEmployees } from '../../data/mockData';
import {
  parseEmployeesExcel, downloadEmployeeTemplate, ParsedEmployeeData, ParsedEmployeeRow,
} from '../../utils/employeeBulkParser';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS } from '../../api/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (rows: Employee[]) => void;
  /** Department roster used to map Excel's department name → departmentId. */
  departments?: departmentsApi.Department[];
  /** empNos already in the system — drives the duplicate-ID parser check. */
  existingEmpNos?: string[];
  /** emails already in the system — drives the duplicate-email parser check. */
  existingEmails?: string[];
}

type RowStatus = 'pending' | 'creating' | 'created' | 'failed';
interface RowProgress {
  rowNumber: number;
  status: RowStatus;
  message?: string;
}

/**
 * Maps a parsed row to the backend DTO. Department is resolved by
 * case-insensitive exact match against the `departments` roster; unknown
 * names fall through as null so the employee imports without a department.
 */
function buildCreateRequest(
  row: ParsedEmployeeRow,
  deptByLowerName: Map<string, string>,
): employeesApi.CreateEmployeeRequest & { empNo: string } {
  const d = row.data;
  const deptName = d.department?.trim();
  const departmentId = deptName ? deptByLowerName.get(deptName.toLowerCase()) ?? null : null;

  return {
    empNo: d.id as string,
    name: d.name as string,
    khmerName: d.khmerName,
    email: d.email as string,
    position: d.position as string,
    departmentId,
    joinDate: d.joinDate as string,
    baseSalary: d.baseSalary as number,
    managerId: undefined,
    contactNumber: d.contactNumber,
    gender: d.gender,
    dateOfBirth: d.dateOfBirth,
    placeOfBirth: d.placeOfBirth,
    currentAddress: d.currentAddress,
    nffNo: d.nffNo,
    tid: d.tid,
    contractExpireDate: d.contractExpireDate,
  };
}

/** Pool-of-N concurrent async runner with progress callbacks. */
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

export function BulkUploadEmployeesDialog({
  open, onOpenChange, onImported, departments, existingEmpNos, existingEmails,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedEmployeeData | null>(null);

  // Progress while POSTing to the backend.
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number } | null>(null);

  // View filter + per-row selection. Passed rows start checked; failed rows
  // are uncheckable — the rule is "upload Green only".
  type ViewFilter = 'all' | 'passed' | 'failed';
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Seed selection whenever a fresh parse lands: all currently-valid rows
  // are selected by default; the user can deselect any of them.
  useEffect(() => {
    if (!parsed) {
      setSelectedRows(new Set());
      return;
    }
    setSelectedRows(new Set(parsed.employees.filter(r => r.errors.length === 0).map(r => r.rowNumber)));
  }, [parsed]);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setParsing(false);
    setImporting(false);
    setProgress(new Map());
    setFinalResult(null);
    setViewFilter('all');
    setSelectedRows(new Set());
  };

  const resolvedExistingEmpNos = existingEmpNos ?? (USE_MOCKS ? mockEmployees.map(e => e.id) : []);
  const resolvedExistingEmails = existingEmails ?? (USE_MOCKS ? mockEmployees.map(e => e.email) : []);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParsed(null);
    setFinalResult(null);
    setProgress(new Map());

    try {
      const result = await parseEmployeesExcel(f, resolvedExistingEmpNos, resolvedExistingEmails);
      setParsed(result);
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else {
        const errorCount = result.employees.reduce((n, r) => n + r.errors.length, 0);
        if (errorCount > 0) toast.error(`${errorCount} issue(s) across ${result.totalRows - result.validRows} row(s)`);
        else if (result.totalRows > 0) toast.success(`Ready to import ${result.validRows} employee${result.validRows !== 1 ? 's' : ''}`);
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

    // Import only the rows the user has ticked (defaults to all valid rows).
    // Ticking a failed row is prevented in the UI, but belt-and-suspenders
    // the filter here too.
    const rowsToImport = parsed.employees.filter(
      r => selectedRows.has(r.rowNumber) && r.errors.length === 0,
    );
    if (rowsToImport.length === 0) {
      toast.error('Select at least one valid row to import.');
      return;
    }

    // ----- Mock mode: no backend — just hand rows back to the parent. -----
    if (USE_MOCKS) {
      const newRows: Employee[] = rowsToImport.map(r => ({
        ...r.data,
        status: r.data.status ?? 'active',
      } as Employee));
      onImported(newRows);
      toast.success(`Imported ${newRows.length} employee${newRows.length !== 1 ? 's' : ''}`);
      reset();
      onOpenChange(false);
      return;
    }

    // ----- Live mode: POST each row concurrently. -----
    const deptByLowerName = new Map<string, string>(
      (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
    );

    // Seed progress map so the UI can render state straight away.
    const initial = new Map<number, RowProgress>(
      rowsToImport.map(r => [r.rowNumber, { rowNumber: r.rowNumber, status: 'pending' as const }]),
    );
    setProgress(initial);
    setImporting(true);

    const created: Employee[] = [];
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
        const body = buildCreateRequest(row, deptByLowerName);
        return employeesApi.create(body);
      },
      5, // 5 concurrent POSTs — gentle on the backend, fast enough for 300+ rows
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
          created.push(result as unknown as Employee);
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
      onImported(created);
      toast.success(
        failCount === 0
          ? `Imported ${okCount} employee${okCount !== 1 ? 's' : ''}`
          : `Imported ${okCount} of ${okCount + failCount} — ${failCount} failed`,
        { duration: 6000 },
      );
    }
    if (okCount === 0 && failCount > 0) {
      toast.error('No employees imported — every row failed. See the table for details.', { duration: 8000 });
    }
    // Keep the dialog open so the user can see per-row outcomes.
  };

  const summary = parsed ? {
    total: parsed.totalRows,
    valid: parsed.validRows,
    errors: parsed.employees.reduce((n, r) => n + r.errors.length, 0),
    warnings: parsed.employees.reduce((n, r) => n + r.warnings.length, 0),
    errorRows: parsed.employees.filter(r => r.errors.length > 0).length,
  } : null;

  const doneCount = Array.from(progress.values()).filter(p => p.status === 'created' || p.status === 'failed').length;
  const progressPct = selectedRows.size > 0 ? Math.round((doneCount / selectedRows.size) * 100) : 0;

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
            Upload Bulk Employees
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx) with one row per employee. Required columns: Employee ID, Name, Email, Position, Join Date, Base Salary. Department is optional. Blank rows are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template + pick file */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
              <FileSpreadsheet className="h-10 w-10 text-gray-400 mb-2" />
              <p className="text-sm font-medium">Download the Excel template</p>
              <p className="text-xs text-gray-500 mb-3">With all supported columns + example row</p>
              <Button variant="outline" size="sm" onClick={downloadEmployeeTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
            <div className="p-4 rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
              <Upload className="h-10 w-10 text-gray-400 mb-2" />
              <p className="text-sm font-medium">Select your file</p>
              <p className="text-xs text-gray-500 mb-3">.xlsx, .xls, or .csv — up to 5 MB</p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleSelect}
                id="bulk-employees-file"
                className="hidden"
                disabled={importing}
              />
              <label htmlFor="bulk-employees-file">
                <Button variant="outline" size="sm" asChild disabled={parsing || importing}>
                  <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                </Button>
              </label>
              {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
            </div>
          </div>

          {/* Summary banner */}
          {parsed && summary && !finalResult && !importing && (
            <div className={`rounded-md border p-3 ${
              summary.errors > 0 ? 'bg-red-50 border-red-200'
                : summary.warnings > 0 ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-start gap-3">
                {summary.errors > 0 ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  : summary.warnings > 0 ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  : <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  {summary.errors > 0 ? (
                    <>
                      <p className="font-medium text-red-900">
                        {summary.errors} error{summary.errors !== 1 ? 's' : ''} across {summary.errorRows} row{summary.errorRows !== 1 ? 's' : ''}
                        {summary.valid > 0 ? ` · ${summary.valid} row${summary.valid !== 1 ? 's' : ''} still importable` : ' — nothing to import'}
                      </p>
                      <p className="text-sm text-red-800">
                        {summary.valid > 0
                          ? 'Switch to the Passed tab to review and import the green rows. Fix the failed rows in Excel and re-upload separately.'
                          : 'Fix the highlighted rows in your spreadsheet and re-upload.'}
                      </p>
                    </>
                  ) : summary.warnings > 0 ? (
                    <>
                      <p className="font-medium text-amber-900">
                        {summary.total} row{summary.total !== 1 ? 's' : ''} parsed · {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-amber-800">You can proceed but review the highlighted rows.</p>
                    </>
                  ) : (
                    <p className="font-medium text-green-900">
                      {summary.total} employee{summary.total !== 1 ? 's' : ''} ready to import — no issues
                    </p>
                  )}
                </div>
              </div>
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
                      ? `All ${finalResult.ok} employee${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No employees imported — all ${finalResult.failed} failed`
                        : `${finalResult.ok} imported · ${finalResult.failed} failed`}
                  </p>
                  {finalResult.failed > 0 && (
                    <p className="text-sm text-gray-700">Failed rows are highlighted below with the backend error message.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Preview: tabbed view + per-row checkboxes */}
          {parsed && parsed.employees.length > 0 && (() => {
            const passedRows = parsed.employees.filter(r => r.errors.length === 0);
            const failedRows = parsed.employees.filter(r => r.errors.length > 0);
            const visibleRows = viewFilter === 'passed' ? passedRows
              : viewFilter === 'failed' ? failedRows
              : parsed.employees;
            const visibleSelectable = visibleRows.filter(r => r.errors.length === 0);
            const visibleSelectedCount = visibleSelectable.filter(r => selectedRows.has(r.rowNumber)).length;
            const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectedCount === visibleSelectable.length;
            const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

            const toggleAllVisible = () => {
              setSelectedRows(prev => {
                const next = new Set(prev);
                if (allVisibleSelected) {
                  visibleSelectable.forEach(r => next.delete(r.rowNumber));
                } else {
                  visibleSelectable.forEach(r => next.add(r.rowNumber));
                }
                return next;
              });
            };
            const toggleOne = (rowNumber: number) => {
              setSelectedRows(prev => {
                const next = new Set(prev);
                if (next.has(rowNumber)) next.delete(rowNumber);
                else next.add(rowNumber);
                return next;
              });
            };

            const tabBtn = (key: ViewFilter, label: string, count: number, tone: 'neutral' | 'green' | 'red') => {
              const active = viewFilter === key;
              const color = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : 'text-gray-700';
              return (
                <button
                  type="button"
                  onClick={() => setViewFilter(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-white shadow-sm border ' + color
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tone === 'green' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
                  {tone === 'red' && <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                  {label}
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active ? 'bg-gray-100' : 'bg-gray-200/70'
                  }`}>{count}</span>
                </button>
              );
            };

            return (
              <div className="space-y-2">
                {/* Tab bar */}
                <div className="flex items-center justify-between">
                  <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
                    {tabBtn('all', 'All', parsed.employees.length, 'neutral')}
                    {tabBtn('passed', 'Passed', passedRows.length, 'green')}
                    {tabBtn('failed', 'Failed', failedRows.length, 'red')}
                  </div>
                  <div className="text-xs text-gray-600 tabular-nums">
                    {selectedRows.size} of {passedRows.length} selected
                  </div>
                </div>

                <div className="rounded-md border overflow-auto max-h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100 z-10">
                      <tr>
                        <th className="px-2 py-2 w-10 text-center">
                          <Checkbox
                            checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleAllVisible}
                            disabled={visibleSelectable.length === 0 || importing}
                            aria-label="Select all passed rows"
                          />
                        </th>
                        <th className="px-2 py-2 w-10 text-center">Status</th>
                        <th className="sticky left-0 bg-gray-100 text-left px-3 py-2 font-medium">ID</th>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-left px-3 py-2 font-medium">Email</th>
                        <th className="text-left px-3 py-2 font-medium">Position</th>
                        <th className="text-left px-3 py-2 font-medium">Department</th>
                        <th className="text-right px-3 py-2 font-medium">Salary</th>
                        <th className="text-left px-3 py-2 font-medium">Bank</th>
                        <th className="text-left px-3 py-2 font-medium">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.length === 0 && (
                        <tr>
                          <td colSpan={10} className="text-center py-8 text-gray-400">
                            {viewFilter === 'passed' ? 'No rows passed validation yet.' : 'No rows with issues.'}
                          </td>
                        </tr>
                      )}
                      {visibleRows.map(row => {
                        const prog = progress.get(row.rowNumber);
                        const hasErr = row.errors.length > 0;
                        const hasWarn = !hasErr && row.warnings.length > 0;
                        const isCreated = prog?.status === 'created';
                        const isFailed = prog?.status === 'failed';
                        const isCreating = prog?.status === 'creating';

                        const rowBg = isFailed ? 'bg-red-50'
                          : isCreated ? 'bg-green-50'
                          : isCreating ? 'bg-blue-50'
                          : hasErr ? 'bg-red-50'
                          : hasWarn ? 'bg-amber-50'
                          : '';

                        const checked = selectedRows.has(row.rowNumber);

                        return (
                          <tr key={row.rowNumber} className={`border-t ${rowBg}`} title={[prog?.message, ...row.errors, ...row.warnings].filter(Boolean).join('\n') || undefined}>
                            <td className={`px-2 py-2 text-center ${rowBg}`}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleOne(row.rowNumber)}
                                disabled={hasErr || importing || isCreated}
                                aria-label={`Select row ${row.rowNumber}`}
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
                            <td className={`sticky left-0 px-3 py-2 font-medium ${rowBg || 'bg-white'}`}>{row.data.id ?? ''}</td>
                            <td className="px-3 py-2">{row.data.name ?? ''}</td>
                            <td className="px-3 py-2">{row.data.email ?? ''}</td>
                            <td className="px-3 py-2">{row.data.position ?? ''}</td>
                            <td className="px-3 py-2">{row.data.department ?? ''}</td>
                            <td className="text-right px-3 py-2 tabular-nums">
                              {row.data.baseSalary != null ? `$${row.data.baseSalary.toLocaleString()}` : ''}
                            </td>
                            <td className="px-3 py-2">
                              {row.data.bankName ? `${row.data.bankName} ${row.data.bankAccount ? '· ' + row.data.bankAccount : ''}` : ''}
                            </td>
                            <td className="px-3 py-2 max-w-[240px]">
                              {isFailed ? (
                                <span className="text-red-700 block truncate" title={prog?.message}>
                                  {prog?.message ?? 'Failed'}
                                </span>
                              ) : isCreated ? (
                                <span className="text-green-700 block">Imported</span>
                              ) : row.errors.length > 0 ? (
                                <span className="text-red-700 block truncate" title={row.errors.join('\n')}>
                                  {row.errors[0]}
                                  {row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}
                                </span>
                              ) : row.warnings.length > 0 ? (
                                <span className="text-amber-700 block truncate" title={row.warnings.join('\n')}>
                                  {row.warnings[0]}
                                  {row.warnings.length > 1 ? ` (+${row.warnings.length - 1})` : ''}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {!parsed && (
            <div className="text-center text-sm text-gray-400 py-8">
              Select a file to see the import preview here.
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
            ) : summary ? (
              <span className="inline-flex items-center gap-1 font-medium">
                {summary.errors > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-700 mr-3">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {summary.errorRows} failed
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {selectedRows.size} selected · {summary.valid} valid of {summary.total}
                </span>
              </span>
            ) : (
              <span className="text-gray-400">Pick a file to preview</span>
            )}
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
                disabled={!parsed || parsed.totalRows === 0 || selectedRows.size === 0 || importing}
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
                      ? 'No rows selected'
                      : `Import ${selectedRows.size} Selected${selectedRows.size !== 1 ? '' : ''}`}
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
