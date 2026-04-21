import { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
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
  parseEmployeesExcel, downloadEmployeeTemplate, ParsedEmployeeData,
} from '../../utils/employeeBulkParser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (rows: Employee[]) => void;
}

export function BulkUploadEmployeesDialog({ open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedEmployeeData | null>(null);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setParsing(false);
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParsed(null);

    try {
      const result = await parseEmployeesExcel(
        f,
        mockEmployees.map(e => e.id),
        mockEmployees.map(e => e.email),
      );
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

  const handleImport = () => {
    if (!parsed) return;
    const rowsWithErrors = parsed.employees.filter(r => r.errors.length > 0).length;
    if (rowsWithErrors > 0) {
      toast.error(`Fix ${rowsWithErrors} error row${rowsWithErrors !== 1 ? 's' : ''} before importing.`);
      return;
    }
    const newRows: Employee[] = parsed.employees.map(r => ({
      ...r.data,
      status: r.data.status ?? 'active',
    } as Employee));
    onImported(newRows);
    toast.success(`Imported ${newRows.length} employee${newRows.length !== 1 ? 's' : ''}`);
    reset();
    onOpenChange(false);
  };

  const summary = parsed ? {
    total: parsed.totalRows,
    valid: parsed.validRows,
    errors: parsed.employees.reduce((n, r) => n + r.errors.length, 0),
    warnings: parsed.employees.reduce((n, r) => n + r.warnings.length, 0),
    errorRows: parsed.employees.filter(r => r.errors.length > 0).length,
  } : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Bulk Employees
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx) with one row per employee. Required columns: Employee ID, Name, Email, Position, Department, Join Date, Base Salary.
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
              />
              <label htmlFor="bulk-employees-file">
                <Button variant="outline" size="sm" asChild disabled={parsing}>
                  <span>{parsing ? 'Parsing…' : (file ? 'Replace File' : 'Select File')}</span>
                </Button>
              </label>
              {file && <p className="mt-2 text-xs text-gray-600">{file.name}</p>}
            </div>
          </div>

          {/* Summary banner */}
          {parsed && summary && (
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
                        {summary.errors} error{summary.errors !== 1 ? 's' : ''} across {summary.errorRows} row{summary.errorRows !== 1 ? 's' : ''} — cannot import
                      </p>
                      <p className="text-sm text-red-800">Fix the highlighted rows in your spreadsheet and re-upload.</p>
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

          {/* Preview table */}
          {parsed && parsed.employees.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-[360px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
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
                  {parsed.employees.map(row => {
                    const hasErr = row.errors.length > 0;
                    const hasWarn = !hasErr && row.warnings.length > 0;
                    const rowBg = hasErr ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : '';
                    const tip = [...row.errors, ...row.warnings].join('\n');
                    return (
                      <tr key={row.rowNumber} className={`border-t ${rowBg}`} title={tip || undefined}>
                        <td className={`px-2 py-2 text-center ${rowBg}`}>
                          {hasErr ? <AlertCircle className="h-4 w-4 text-red-600 inline" />
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
                          {row.errors.length > 0 && (
                            <span className="text-red-700 block truncate" title={row.errors.join('\n')}>
                              {row.errors[0]}
                              {row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}
                            </span>
                          )}
                          {!row.errors.length && row.warnings.length > 0 && (
                            <span className="text-amber-700 block truncate" title={row.warnings.join('\n')}>
                              {row.warnings[0]}
                              {row.warnings.length > 1 ? ` (+${row.warnings.length - 1})` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!parsed && (
            <div className="text-center text-sm text-gray-400 py-8">
              Select a file to see the import preview here.
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-white sm:justify-between sm:items-center gap-3">
          <div className="text-xs">
            {summary ? (
              summary.errors > 0 ? (
                <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {summary.errors} error{summary.errors !== 1 ? 's' : ''} · {summary.valid}/{summary.total} valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {summary.valid} ready to import
                </span>
              )
            ) : (
              <span className="text-gray-400">Pick a file to preview</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {parsed && (
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!parsed || parsed.totalRows === 0 || (summary?.errors ?? 0) > 0}
            >
              <Upload className="h-4 w-4 mr-2" />
              {summary?.errors && summary.errors > 0
                ? `Fix ${summary.errors} Error${summary.errors !== 1 ? 's' : ''} to Import`
                : `Import ${summary?.valid ?? 0} Employee${(summary?.valid ?? 0) !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
