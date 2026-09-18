import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Progress } from '../ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  FileSpreadsheet, Upload, Download, AlertCircle, AlertTriangle, CheckCircle, RefreshCw, Info,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import { Employee } from '../../types/hrms';
import { mockEmployees } from '../../data/mockData';
import {
  parseEmployeesExcel, downloadEmployeeTemplate, ParsedEmployeeData, ParsedEmployeeRow,
} from '../../utils/employeeBulkParser';
import { tidTypeFor, visaExpireFor } from '../../utils/idType';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import { USE_MOCKS, ApiError as ApiClientError } from '../../api/client';
import { SeatCapDialog } from './SeatCapDialog';

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
  /**
   * The roster the parent already has paged to completion. The manager
   * pass resolves the spreadsheet's Employee ID refs against it, so the
   * dialog doesn't re-fetch thousands of rows the caller is holding.
   * Note it carries the caller's server-side scoping: a 'manager' role
   * only ever sees themselves plus their direct reports.
   */
  existingEmployees?: employeesApi.Employee[];
}

// 'partial' = the employee was created, but their Manager columns could not
// be applied. Kept distinct from 'created' so a half-imported row is never
// counted as a clean success.
type RowStatus = 'pending' | 'creating' | 'created' | 'partial' | 'failed';
interface RowProgress {
  rowNumber: number;
  status: RowStatus;
  message?: string;
}

/** True when the row named a manager on the spreadsheet. */
function hasLadderRefs(row: ParsedEmployeeRow): boolean {
  return Boolean(row.data.managerId);
}

/**
 * Maps a parsed row to the backend DTO. Department is resolved by
 * case-insensitive exact match against the `departments` roster; unknown
 * names fall through as null so the employee imports without a department.
 */
function buildCreateRequest(
  row: ParsedEmployeeRow,
  deptByLowerName: Map<string, string>,
): employeesApi.CreateEmployeeRequest & { empNo: string; departmentName?: string | null } {
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
    // Pass the raw spreadsheet value through so the backend can find-or-create
    // a Department row when the name didn't match anything in our roster.
    // Server keeps using departmentId when set, so this is purely a fallback.
    departmentName: deptName || null,
    joinDate: d.joinDate as string,
    baseSalary: d.baseSalary as number,
    // The reports-to ladder stays out of the create on purpose: a row's
    // manager may be another row of this same file that doesn't exist yet.
    // The empNo refs are resolved and PUT in a second pass once every
    // selected row has been created.
    managerId: undefined,
    contactNumber: d.contactNumber,
    gender: d.gender,
    dateOfBirth: d.dateOfBirth,
    placeOfBirth: d.placeOfBirth,
    currentAddress: d.currentAddress,
    nffNo: d.nffNo,
    tid: d.tid,
    // v-id-type-single-source — the three ID columns travel as one package.
    // EmployeeService.create assigns tid_type / nationality_type /
    // visa_expire_date straight off the request with no "only if present"
    // guard, so a key we leave out lands as NULL, not as a default. Sending
    // tid alone is what left every bulk-imported foreigner looking local.
    //
    // Unset must STAY unset. tidTypeFor(undefined) answers 'TID' — the right
    // thing to *show* for a row nobody classified, the wrong thing to
    // *persist*: it would stamp "National ID" onto every row of a file that
    // never carried the column, and on a re-import silently demote passport
    // holders whose type simply wasn't exported. So the pair is written only
    // when the spreadsheet actually said something.
    //
    // Explicit nulls rather than omitted keys: server-side they are
    // identical (Jackson maps an absent field to null, and
    // normalizeTidType/normalizeNationalityType map null to null), and the
    // null is visible on the wire when someone debugs a row that imported
    // with no ID type.
    nationalityType: d.nationalityType ?? null,
    tidType: d.nationalityType ? tidTypeFor(d.nationalityType) : null,
    // Already null-safe for the unset case — visaExpireFor only lets a date
    // through on passport — so an orphan visa date can't ride along on a
    // national-ID or untyped row.
    visaExpireDate: visaExpireFor(d.nationalityType, d.visaExpireDate),
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
  open, onOpenChange, onImported, departments, existingEmpNos, existingEmails, existingEmployees,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedEmployeeData | null>(null);

  // Progress while POSTing to the backend.
  const [importing, setImporting] = useState(false);
  // 'creating' = POSTing rows, 'linking' = second pass writing the manager
  // ladder. Only drives the banner wording; every row is already counted
  // as done by the time linking starts.
  const [importPhase, setImportPhase] = useState<'creating' | 'linking'>('creating');
  const [progress, setProgress] = useState<Map<number, RowProgress>>(new Map());
  const [finalResult, setFinalResult] = useState<{ ok: number; failed: number; partial: number } | null>(null);
  // v-employee-seat-cap — populated when a row returns 402; remaining
  // rows skip immediately and a SeatCapDialog surfaces the reason.
  const [seatCapMessage, setSeatCapMessage] = useState<string | null>(null);

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
    setImportPhase('creating');
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
      // Mirror buildCreateRequest's ID handling rather than passing
      // r.data through raw. This path never touches the server, so it is
      // the ONLY thing a mock-mode demo or QA pass ever sees — and it
      // used to keep a visa date on a National ID row that live mode
      // drops, so testing here would certify the silent-loss bug as
      // absent. Same rules, same outcome, both modes.
      const newRows: Employee[] = rowsToImport.map(r => ({
        ...r.data,
        tidType: r.data.nationalityType ? tidTypeFor(r.data.nationalityType) : undefined,
        visaExpireDate: visaExpireFor(r.data.nationalityType, r.data.visaExpireDate) ?? undefined,
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
    setImportPhase('creating');
    setImporting(true);

    const created: Employee[] = [];
    // Backend-shaped rows from pass 1, keyed by upper-cased empNo. Pass 2
    // resolves the spreadsheet's manager refs against these, and needs the
    // whole object to rebuild the PUT body.
    const createdByEmpNo = new Map<string, employeesApi.Employee>();
    let okCount = 0;
    let failCount = 0;
    // v-employee-seat-cap — once one row returns 402 (plan cap reached),
    // every remaining row is guaranteed to fail too. Flip a shared abort
    // flag so the worker skips the remaining API calls instead of
    // hammering the backend for 200+ predictable failures. In-flight
    // requests (up to 5) still finish naturally.
    let seatCapHit: string | null = null;

    await runWithConcurrency(
      rowsToImport,
      async (row) => {
        if (seatCapHit) throw new Error('Skipped — plan seat cap reached earlier in this upload');
        setProgress(prev => {
          const next = new Map(prev);
          next.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'creating' });
          return next;
        });
        const body = buildCreateRequest(row, deptByLowerName);
        try {
          return await employeesApi.create(body);
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 402) {
            seatCapHit = err.message || 'Employee seat cap reached for this plan.';
          }
          throw err;
        }
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
          createdByEmpNo.set((row.data.id ?? '').toUpperCase(), result);
          setProgress(prev => {
            const next = new Map(prev);
            next.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'created' });
            return next;
          });
        }
      },
    );

    if (seatCapHit) setSeatCapMessage(seatCapHit);

    // ----- Pass 2: write the reports-to ladder. -----
    // Deferred until every row exists, because a file may list an employee
    // before the manager it points at. Rows whose create failed are skipped:
    // there is nothing to link.
    const ladderRows = rowsToImport.filter(
      r => hasLadderRefs(r) && createdByEmpNo.has((r.data.id ?? '').toUpperCase()),
    );
    let partialCount = 0;

    if (ladderRows.length > 0) {
      setImportPhase('linking');

      // Managers can just as well be people already on the roster, so index
      // it alongside this upload's rows. The parent hands us the roster it
      // has already paged to completion — re-fetching it here would be MBs
      // of JSON for what is usually a handful of PUTs.
      //
      // Two indexes: empNo uniqueness is case-SENSITIVE on the backend, so
      // 'mgr-01' and 'MGR-01' can both exist. Match exactly first and only
      // fall back to a case-insensitive hit when it is unambiguous, rather
      // than silently linking to whichever row was indexed last.
      const rosterByEmpNo = new Map<string, employeesApi.Employee>();
      const rosterByUpper = new Map<string, employeesApi.Employee | null>();
      (existingEmployees ?? []).forEach(e => {
        rosterByEmpNo.set(e.empNo, e);
        const up = e.empNo.toUpperCase();
        rosterByUpper.set(up, rosterByUpper.has(up) ? null : e);
      });

      await runWithConcurrency(
        ladderRows,
        async (row): Promise<string | null> => {
          const self = createdByEmpNo.get((row.data.id ?? '').toUpperCase())!;
          const unresolved: string[] = [];
          const notActive: string[] = [];
          const resolve = (ref: string | undefined): string | null => {
            if (!ref) return null;
            const hit = rosterByEmpNo.get(ref)
              ?? createdByEmpNo.get(ref.toUpperCase())
              ?? rosterByUpper.get(ref.toUpperCase())
              ?? null;
            if (!hit) { unresolved.push(ref); return null; }
            // Every manager picker in the app offers active employees only,
            // so don't let the bulk path write a route to someone who left —
            // the profile editor could not even display it.
            if (hit.status && hit.status !== 'active') { notActive.push(ref); return null; }
            return hit.id;
          };

          const managerId = resolve(row.data.managerId);

          // PUT is a full overwrite — send the created row back verbatim
          // with only the manager laid on top, or every other field would
          // be nulled out. Skip the call when nothing resolved: the
          // employee already has no manager.
          if (managerId) {
            await employeesApi.update(self.id, { ...self, managerId });
          }

          // Created either way — an unmatched manager downgrades the row to
          // a warning rather than failing an employee who already exists.
          // Don't claim they don't exist: the roster we matched against is
          // scoped to what this user is allowed to see.
          const notes = [
            unresolved.length > 0
              ? `manager ${unresolved.join(', ')} did not match any Employee ID in this file or the roster you can see`
              : null,
            notActive.length > 0
              ? `manager ${notActive.join(', ')} is not an active employee`
              : null,
          ].filter(Boolean);
          return notes.length > 0 ? `Imported, but ${notes.join('; ')}` : null;
        },
        5, // same gentle pool as the creates above
        (row, _i, result) => {
          // A rejected PUT lands here too. 403 is its own story: POST and
          // PUT are separate permissions, so a create-without-update role
          // gets here with every employee already made.
          const message = result instanceof Error
            ? (result instanceof ApiClientError && result.status === 403
                ? 'Imported, but setting the manager needs the "edit employee" permission'
                : `Imported, but the manager ladder was rejected: ${result.message}`)
            : result;
          if (!message) return;
          partialCount++;
          setProgress(prev => {
            const next = new Map(prev);
            next.set(row.rowNumber, { rowNumber: row.rowNumber, status: 'partial', message });
            return next;
          });
        },
      );
    }

    setImporting(false);
    setImportPhase('creating');
    setFinalResult({ ok: okCount, failed: failCount, partial: partialCount });

    if (okCount > 0) {
      onImported(created);
      toast.success(
        failCount === 0 && partialCount === 0
          ? `Imported ${okCount} employee${okCount !== 1 ? 's' : ''}`
          : [
              `Imported ${okCount} of ${okCount + failCount}`,
              failCount > 0 ? `${failCount} failed` : null,
              partialCount > 0 ? `${partialCount} without their manager` : null,
            ].filter(Boolean).join(' — '),
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

  const doneCount = Array.from(progress.values()).filter(
    p => p.status === 'created' || p.status === 'partial' || p.status === 'failed',
  ).length;
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
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Upload format details"
                    className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-full"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm text-xs leading-relaxed">
                  Upload an Excel file (.xlsx) with one row per employee. Required columns: Employee ID, Name, Email, Join Date, Base Salary. Position + Department are optional. The Manager 1/2/3 columns take the manager's Employee ID and are applied after every row is created, so a manager listed further down the file still links. Blank rows are skipped automatically.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Upload an Excel file (.xlsx) with one row per employee. Required columns: Employee ID, Name, Email, Join Date, Base Salary. Position + Department are optional. The Manager 1/2/3 columns take the manager's Employee ID and are applied after every row is created, so a manager listed further down the file still links. Blank rows are skipped automatically.
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
                    {importPhase === 'linking'
                      ? 'Linking managers…'
                      : `Importing ${doneCount} of ${selectedRows.size}…`}
                  </p>
                  <Progress value={progressPct} className="h-1.5" />
                </div>
              </div>
            </div>
          )}

          {/* Final result banner */}
          {finalResult && !importing && (
            <div className={`rounded-md border p-3 ${
              finalResult.failed === 0 && finalResult.partial === 0 ? 'bg-green-50 border-green-200'
                : finalResult.ok === 0 ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                {finalResult.failed === 0 && finalResult.partial === 0 ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  : finalResult.ok === 0 ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {finalResult.failed === 0 && finalResult.partial === 0
                      ? `All ${finalResult.ok} employee${finalResult.ok !== 1 ? 's' : ''} imported successfully`
                      : finalResult.ok === 0
                        ? `No employees imported — all ${finalResult.failed} failed`
                        : [
                            `${finalResult.ok} imported`,
                            finalResult.partial > 0 ? `${finalResult.partial} without their manager` : null,
                            finalResult.failed > 0 ? `${finalResult.failed} failed` : null,
                          ].filter(Boolean).join(' · ')}
                  </p>
                  {finalResult.failed > 0 && (
                    <p className="text-sm text-gray-700">Failed rows are highlighted below with the backend error message.</p>
                  )}
                  {finalResult.partial > 0 && (
                    <p className="text-sm text-gray-700">
                      Amber rows were created — only their Manager columns didn't stick. Fix those on the employee's profile, or correct the Employee IDs and re-upload just those rows.
                    </p>
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
                        const isPartial = prog?.status === 'partial';
                        const isFailed = prog?.status === 'failed';
                        const isCreating = prog?.status === 'creating';

                        const rowBg = isFailed ? 'bg-red-50'
                          : isPartial ? 'bg-amber-50'
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
                                disabled={hasErr || importing || isCreated || isPartial}
                                aria-label={`Select row ${row.rowNumber}`}
                              />
                            </td>
                            <td className={`px-2 py-2 text-center ${rowBg}`}>
                              {isCreated ? <CheckCircle className="h-4 w-4 text-green-600 inline" />
                                : isPartial ? <AlertTriangle className="h-4 w-4 text-amber-600 inline" />
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
                              ) : isPartial ? (
                                <span className="text-amber-700 block truncate" title={prog?.message}>
                                  {prog?.message ?? 'Imported without their manager'}
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

        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-white sm:justify-between sm:items-center gap-3">
          <div className="text-xs">
            {finalResult ? (
              <span className={`inline-flex items-center gap-1 font-medium ${finalResult.failed === 0 && finalResult.partial === 0 ? 'text-green-700' : finalResult.ok === 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {finalResult.failed === 0 && finalResult.partial === 0 ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {finalResult.ok} imported · {finalResult.failed} failed
                {finalResult.partial > 0 ? ` · ${finalResult.partial} without manager` : ''}
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
      <SeatCapDialog
        open={seatCapMessage != null}
        message={seatCapMessage}
        onClose={() => setSeatCapMessage(null)}
      />
    </Dialog>
  );
}
