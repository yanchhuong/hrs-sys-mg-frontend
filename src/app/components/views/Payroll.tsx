import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { mockPayroll, mockEmployees } from '../../data/mockData';
import { mockPayrollBatches } from '../../data/settingsData';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { DollarSign, Download, FileText, Upload, FileSpreadsheet, Package, ArrowLeft, Calendar, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { downloadPayrollTemplate } from '../../utils/excelTemplate';
import { parsePayrollExcel, ParsedPayrollData } from '../../utils/excelParser';
import { exportPayrollToExcel } from '../../utils/excelExport';

export function Payroll() {
  const { currentUser, currentEmployee } = useAuth();
  const [selectedPayslip, setSelectedPayslip] = useState<typeof mockPayroll[0] | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<typeof mockPayrollBatches[0] | null>(null);
  const [previewData, setPreviewData] = useState<ParsedPayrollData | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  const isEmployee = currentUser?.role === 'employee';
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const months = [
    { value: 'all', label: 'All Months' },
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  // Get unique years from payroll data
  const availableYears = Array.from(
    new Set(mockPayroll.map(p => p.month.split('-')[0]))
  ).sort((a, b) => b.localeCompare(a));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setIsParsingFile(true);
      setPreviewData(null);

      try {
        const parsed = await parsePayrollExcel(file, {
          knownEmployeeIds: mockEmployees.map(e => e.id),
        });
        setPreviewData(parsed);

        if (parsed.errors.length > 0) {
          toast.error(`Found ${parsed.errors.length} error(s) in ${parsed.totalEmployees - parsed.validEmployees} row(s)`);
        } else if (parsed.warnings.length > 0) {
          toast.warning(`${parsed.totalEmployees} row(s) parsed, ${parsed.warnings.length} warning(s)`);
        } else {
          toast.success(`Successfully parsed ${parsed.totalEmployees} employee(s)`);
        }
      } catch (error) {
        toast.error('Failed to parse Excel file');
        setSelectedFile(null);
      } finally {
        setIsParsingFile(false);
      }
    }
  };

  const handleUploadPayroll = () => {
    if (!selectedFile || !batchName || !periodStart || !periodEnd) {
      toast.error('Please fill in all fields and select a file');
      return;
    }

    if (!previewData) {
      toast.error('Please wait for file preview to complete');
      return;
    }

    if (previewData.errors.length > 0) {
      toast.error('Cannot upload file with errors. Please fix the issues first.');
      return;
    }

    toast.success(`Payroll batch "${batchName}" uploaded successfully - ${previewData.totalEmployees} employees processed`);
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setBatchName('');
    setPeriodStart('');
    setPeriodEnd('');
    setPreviewData(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setUploadDialogOpen(open);
    if (!open) {
      // Reset all states when dialog closes
      setSelectedFile(null);
      setBatchName('');
      setPeriodStart('');
      setPeriodEnd('');
      setPreviewData(null);
      setPreviewDialogOpen(false);
    }
  };

  let payrollRecords = isEmployee
    ? mockPayroll.filter(pay => pay.employeeId === currentUser.employeeId)
    : mockPayroll;

  // Apply year and month filters
  payrollRecords = payrollRecords.filter(pay => {
    const [year, month] = pay.month.split('-');

    // Filter by year
    if (selectedYear !== 'all' && year !== selectedYear) {
      return false;
    }

    // Filter by month
    if (selectedMonth !== 'all' && month !== selectedMonth) {
      return false;
    }

    return true;
  });

  const handleDownloadPayslip = (payrollId: string) => {
    toast.success('Payslip downloaded successfully');
  };

  const handleGeneratePayroll = () => {
    toast.success('Payroll generated for current month');
  };

  const handleDownloadTemplate = () => {
    // Get current month and year or use the upload dialog values
    const month = periodStart ? format(new Date(periodStart), 'MM') : format(new Date(), 'MM');
    const year = periodStart ? format(new Date(periodStart), 'yyyy') : format(new Date(), 'yyyy');
    const monthYear = `${month}-${year}`;

    downloadPayrollTemplate(mockEmployees, monthYear);
    toast.success('Payroll template downloaded successfully');
  };

  const calculateOTRate = (baseSalary: number) => {
    const hourlyRate = baseSalary / 160;
    return hourlyRate * 1.5;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payroll Management</h1>
          <p className="text-gray-500">Manage employee compensation and payslips</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-2 border rounded-md bg-white"
            >
              <option value="all">All Years</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border rounded-md bg-white"
            >
              {months.map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>
          {isAdminOrManager && (
          <div className="flex gap-2">
            <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Bulk Payroll
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                  <DialogTitle>Upload Payroll Batch</DialogTitle>
                  <DialogDescription>
                    Upload Excel file with payroll data for multiple employees
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="batchName">Batch Name</Label>
                      <Input
                        id="batchName"
                        placeholder="e.g., April 2026 - 1st Half"
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payroll Frequency</Label>
                      <select className="w-full px-3 py-2 border rounded-md">
                        <option>Twice per month</option>
                        <option>Once per month</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="periodStart">Period Start</Label>
                      <Input
                        id="periodStart"
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="periodEnd">Period End</Label>
                      <Input
                        id="periodEnd"
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="payroll-upload"
                    />
                    <label htmlFor="payroll-upload" className="cursor-pointer">
                      <Button variant="outline" asChild disabled={isParsingFile}>
                        <span>{isParsingFile ? 'Parsing...' : 'Select Excel File'}</span>
                      </Button>
                    </label>
                    {selectedFile && (
                      <p className="mt-2 text-sm text-gray-600">{selectedFile.name}</p>
                    )}
                  </div>

                  {previewData && (() => {
                    const totalEarnings = previewData.employees.reduce((sum, emp) => sum + emp.totalEarnings, 0);
                    const totalNet = previewData.employees.reduce((sum, emp) => sum + emp.netSalary, 0);
                    const totalDeductions = previewData.employees.reduce((sum, emp) => sum + emp.totalDeductions, 0);
                    const errorCount = previewData.errors.length;
                    const warningCount = previewData.warnings.length;
                    const rowsWithErrors = previewData.employees.filter(e => e.errors && e.errors.length > 0).length;
                    const rowsWithWarnings = previewData.employees.filter(e => e.warnings && e.warnings.length > 0).length;
                    const validCount = previewData.validEmployees;

                    return (
                      <div className="border rounded-lg p-4 space-y-3">
                        {/* Validation status banner */}
                        {errorCount > 0 ? (
                          <div className="rounded-md bg-red-50 border border-red-200">
                            <div className="flex items-start gap-3 p-3">
                              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0 space-y-1">
                                <p className="text-sm font-medium text-red-900">
                                  {errorCount} error{errorCount !== 1 ? 's' : ''} across {rowsWithErrors} row{rowsWithErrors !== 1 ? 's' : ''} — fix before uploading
                                </p>
                                <div className="flex items-center gap-3 text-xs text-red-800">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                                    {rowsWithErrors} with errors
                                  </span>
                                  {validCount > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                                      {validCount} valid
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <details className="border-t border-red-200">
                              <summary className="px-3 py-2 text-xs font-medium text-red-900 cursor-pointer hover:bg-red-100/40">
                                Show all errors
                              </summary>
                              <ul className="px-3 pb-3 text-xs text-red-800 space-y-0.5 max-h-40 overflow-y-auto">
                                {previewData.errors.map((error, idx) => (
                                  <li key={idx}>• {error}</li>
                                ))}
                              </ul>
                            </details>
                          </div>
                        ) : warningCount > 0 ? (
                          <div className="rounded-md bg-amber-50 border border-amber-200">
                            <div className="flex items-start gap-3 p-3">
                              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-900">
                                  {previewData.totalEmployees} row{previewData.totalEmployees !== 1 ? 's' : ''} ready · {warningCount} warning{warningCount !== 1 ? 's' : ''} across {rowsWithWarnings} row{rowsWithWarnings !== 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-amber-800 mt-0.5">
                                  You can proceed, but review the highlighted rows.
                                </p>
                              </div>
                            </div>
                            <details className="border-t border-amber-200">
                              <summary className="px-3 py-2 text-xs font-medium text-amber-900 cursor-pointer hover:bg-amber-100/40">
                                Show all warnings
                              </summary>
                              <ul className="px-3 pb-3 text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
                                {previewData.warnings.map((warning, idx) => (
                                  <li key={idx}>• {warning}</li>
                                ))}
                              </ul>
                            </details>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-3 rounded-md bg-green-50 border border-green-200">
                            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                            <p className="text-sm font-medium text-green-900">
                              {previewData.totalEmployees} employee{previewData.totalEmployees !== 1 ? 's' : ''} ready to upload — no issues found
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm text-gray-700">
                            Parsed Payroll
                            {previewData.employees.length > 10 && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                (showing first 10 of {previewData.employees.length})
                              </span>
                            )}
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewDialogOpen(true)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            View Fullscreen
                          </Button>
                        </div>

                        {previewData.employees.length > 0 && (
                          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded">
                            <div>
                              <p className="text-xs text-gray-600">Total Net Salary</p>
                              <p className={`text-lg font-bold ${totalNet === 0 ? 'text-gray-400' : ''}`}>
                                ${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Total Earnings</p>
                              <p className={`text-lg font-bold ${totalEarnings === 0 ? 'text-gray-400' : 'text-green-600'}`}>
                                ${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Total Deductions</p>
                              <p className={`text-lg font-bold ${totalDeductions === 0 ? 'text-gray-400' : 'text-red-600'}`}>
                                ${totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        )}

                        {previewData.employees.length > 0 && (
                          <div className="border rounded-md overflow-auto max-h-[320px]">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-gray-100 z-10">
                                <tr>
                                  <th className="text-center px-2 py-2 font-medium text-gray-700 w-10">#</th>
                                  <th className="sticky left-[40px] bg-gray-100 text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap z-20">Emp No.</th>
                                  <th className="sticky left-[130px] bg-gray-100 text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap z-20">Name</th>
                                  <th className="text-right px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Earnings</th>
                                  <th className="text-right px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Deductions</th>
                                  <th className="text-right px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Net</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewData.employees.slice(0, 10).map((emp, idx) => {
                                  const hasErr = !!emp.errors && emp.errors.length > 0;
                                  const hasWarn = !hasErr && !!emp.warnings && emp.warnings.length > 0;
                                  const rowBg = hasErr ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : 'bg-white';
                                  const rowTone = hasErr ? 'hover:bg-red-100' : hasWarn ? 'hover:bg-amber-100' : 'hover:bg-gray-50';
                                  const tooltip = [...(emp.errors || []), ...(emp.warnings || [])].join('\n');
                                  return (
                                    <tr key={idx} className={`border-t ${rowTone}`} title={tooltip || undefined}>
                                      <td className={`text-center px-2 py-2 text-xs ${rowBg}`}>
                                        {hasErr ? (
                                          <AlertCircle className="h-4 w-4 text-red-600 inline" />
                                        ) : hasWarn ? (
                                          <AlertTriangle className="h-4 w-4 text-amber-600 inline" />
                                        ) : (
                                          <CheckCircle className="h-4 w-4 text-green-600 inline" />
                                        )}
                                      </td>
                                      <td className={`sticky left-[40px] px-3 py-2 font-medium whitespace-nowrap z-10 ${rowBg}`}>{emp.employeeNo}</td>
                                      <td className={`sticky left-[130px] px-3 py-2 whitespace-nowrap z-10 ${rowBg}`}>
                                        {emp.employeeName}
                                      </td>
                                      <td className="text-right px-3 py-2 whitespace-nowrap text-green-700">${emp.totalEarnings.toFixed(2)}</td>
                                      <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">${emp.totalDeductions.toFixed(2)}</td>
                                      <td className={`text-right px-3 py-2 whitespace-nowrap font-semibold ${emp.netSalary < 0 ? 'text-red-700' : ''}`}>${emp.netSalary.toFixed(2)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">
                      WABOOKS Payroll Format (Two-Row Stacked):
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Row 1: Earnings (Basic, Position, OT, Allowances, Bonus)</li>
                      <li>• Row 2: Deductions (Tax, Advance, Loan, NSSF, Others)</li>
                      <li>• Each employee takes 2 rows</li>
                      <li>• Columns A, B, C merged across both rows</li>
                    </ul>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        onClick={handleDownloadTemplate}
                        className="w-full"
                        type="button"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Excel Template
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t shrink-0 bg-white sm:justify-between sm:items-center gap-3">
                  <div className="text-sm">
                    {previewData ? (
                      previewData.errors.length > 0 ? (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {previewData.errors.length} error{previewData.errors.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-600">{previewData.validEmployees} / {previewData.totalEmployees} rows valid</span>
                        </div>
                      ) : previewData.warnings.length > 0 ? (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {previewData.warnings.length} warning{previewData.warnings.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-600">{previewData.totalEmployees} row{previewData.totalEmployees !== 1 ? 's' : ''} parsed</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {previewData.totalEmployees} row{previewData.totalEmployees !== 1 ? 's' : ''} ready
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Select a file to preview</span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => setUploadDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    {previewData && previewData.employees.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setPreviewDialogOpen(true)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Fullscreen
                      </Button>
                    )}
                    <Button
                      onClick={handleUploadPayroll}
                      disabled={!previewData || previewData.errors.length > 0 || isParsingFile}
                      title={previewData && previewData.errors.length > 0 ? `Fix ${previewData.errors.length} error(s) before uploading` : undefined}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {previewData && previewData.errors.length > 0
                        ? `Fix ${previewData.errors.length} Error${previewData.errors.length !== 1 ? 's' : ''} to Upload`
                        : 'Confirm Upload'}
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
              <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none p-8 flex flex-col gap-6">
                <DialogHeader className="shrink-0">
                  <DialogTitle className="text-2xl">Payroll Preview</DialogTitle>
                  <DialogDescription>
                    Review payroll data before uploading
                  </DialogDescription>
                </DialogHeader>
                {previewData && (
                  <div className="flex-1 flex flex-col gap-6 min-h-0">
                    <div className="grid grid-cols-3 gap-6 shrink-0">
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Employees</p>
                        <p className="text-3xl font-bold">{previewData.totalEmployees}</p>
                      </div>
                      <div className="bg-green-50 p-6 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Earnings</p>
                        <p className="text-3xl font-bold text-green-600">
                          ${previewData.employees.reduce((sum, emp) => sum + emp.totalEarnings, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-blue-50 p-6 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Net Salary</p>
                        <p className="text-3xl font-bold text-blue-600">
                          ${previewData.employees.reduce((sum, emp) => sum + emp.netSalary, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto border rounded-lg min-h-0 bg-white">
                      <div className="min-w-max">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b-2 border-gray-300">
                              <th className="px-3 py-3 text-center font-semibold text-sm whitespace-nowrap bg-gray-100 w-12 sticky left-0 z-20">Status</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap border-r bg-gray-100 sticky left-[48px] z-20">Emp No.</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap border-r bg-gray-100 sticky left-[148px] z-20">Name</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Basic Salary</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Position Allow.</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Overtime</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Annual Allow.</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Seniority Allow.</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Bonus</th>
                              <th className="px-4 py-3 text-left font-bold text-sm whitespace-nowrap bg-green-100 border-l-2 border-green-300">Total Earnings</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Withholding Tax</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Advanced Pay</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Loan</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">NSSF Pension</th>
                              <th className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">Others</th>
                              <th className="px-4 py-3 text-left font-bold text-sm whitespace-nowrap bg-red-100 border-l-2 border-red-300">Total Deductions</th>
                              <th className="px-4 py-3 text-left font-bold text-sm whitespace-nowrap bg-blue-100 border-l-2 border-blue-300">Net Salary</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.employees.map((emp, idx) => {
                              const hasErr = !!emp.errors && emp.errors.length > 0;
                              const hasWarn = !hasErr && !!emp.warnings && emp.warnings.length > 0;
                              const rowBg = hasErr ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : 'bg-white';
                              const rowHover = hasErr ? 'hover:bg-red-100' : hasWarn ? 'hover:bg-amber-100' : 'hover:bg-gray-50';
                              const tooltip = [...(emp.errors || []), ...(emp.warnings || [])].join('\n');
                              return (
                              <tr key={idx} className={`border-b border-gray-200 ${rowHover}`} title={tooltip || undefined}>
                                <td className={`px-3 py-3 text-center text-sm sticky left-0 ${rowBg}`}>
                                  {hasErr ? (
                                    <AlertCircle className="h-4 w-4 text-red-600 inline" />
                                  ) : hasWarn ? (
                                    <AlertTriangle className="h-4 w-4 text-amber-600 inline" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 text-green-600 inline" />
                                  )}
                                </td>
                                <td className={`px-4 py-3 font-semibold text-sm border-r sticky left-[48px] ${rowBg}`}>{emp.employeeNo}</td>
                                <td className={`px-4 py-3 text-sm border-r sticky left-[148px] ${rowBg}`}>{emp.employeeName}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.basicSalary.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.positionAllowance.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.overtime.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.annualAllowance.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.seniorityAllowance.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.bonus.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm font-bold text-green-700 whitespace-nowrap bg-green-50 border-l-2 border-green-300">${emp.totalEarnings.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.withholdingTax.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.advancedPayment.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.loan.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.nssfPension.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">${emp.others.toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm font-bold text-red-700 whitespace-nowrap bg-red-50 border-l-2 border-red-300">${emp.totalDeductions.toFixed(2)}</td>
                                <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap bg-blue-50 border-l-2 border-blue-300 ${emp.netSalary < 0 ? 'text-red-700' : 'text-blue-700'}`}>${emp.netSalary.toFixed(2)}</td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={() => {
                const periodLabel =
                  selectedYear !== 'all' && selectedMonth !== 'all' ? `${selectedYear}-${selectedMonth}` :
                  selectedYear !== 'all' ? selectedYear :
                  'All';
                exportPayrollToExcel({
                  payrollItems: payrollRecords,
                  employees: mockEmployees,
                  period: periodLabel,
                });
                toast.success(`Exported ${payrollRecords.length} payroll records`);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={handleGeneratePayroll}>
              <FileText className="mr-2 h-4 w-4" />
              Generate Payroll
            </Button>
          </div>
          )}
        </div>
      </div>

      {isAdminOrManager && !selectedBatch && (
        <Card>
          <CardHeader>
            <CardTitle>Payroll Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Payroll</p>
                <p className="text-xl font-bold">
                  ${mockPayroll.reduce((sum, p) => sum + p.totalPay, 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Base Salaries</p>
                <p className="text-xl font-bold">
                  ${mockPayroll.reduce((sum, p) => sum + p.baseSalary, 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">OT Payments</p>
                <p className="text-xl font-bold">
                  ${mockPayroll.reduce((sum, p) => sum + p.otPay, 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Deductions</p>
                <p className="text-xl font-bold">
                  ${mockPayroll.reduce((sum, p) => sum + p.deductions, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isEmployee && currentEmployee && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Base Salary</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${currentEmployee.baseSalary.toLocaleString()}</div>
              <p className="text-xs text-gray-500">Per month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">OT Rate (1.5x)</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${calculateOTRate(currentEmployee.baseSalary).toFixed(2)}
              </div>
              <p className="text-xs text-gray-500">Per hour</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Last Payment</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${payrollRecords[0]?.totalPay.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-gray-500">
                {payrollRecords[0] ? format(new Date(payrollRecords[0].month + '-01'), 'MM/yyyy') : '-'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isAdminOrManager && !selectedBatch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Payroll Batches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Month/Year</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>No. of Employees</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Total Earnings</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockPayrollBatches.map((batch) => {
                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'approved':
                        return 'bg-green-100 text-green-800 hover:bg-green-100';
                      case 'processed':
                        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
                      default:
                        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
                    }
                  };
                  return (
                    <TableRow key={batch.id}>
                      <TableCell>{format(new Date(batch.date), 'MM-dd-yyyy')}</TableCell>
                      <TableCell>{batch.monthYear}</TableCell>
                      <TableCell>{batch.type}</TableCell>
                      <TableCell>{batch.subject}</TableCell>
                      <TableCell>{batch.totalEmployees} person</TableCell>
                      <TableCell>{batch.currency}</TableCell>
                      <TableCell className="font-semibold">${batch.netSalary.toLocaleString()}</TableCell>
                      <TableCell className="text-green-600">${batch.totalEarnings.toLocaleString()}</TableCell>
                      <TableCell className="text-red-600">${batch.deductions.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-gray-600">{batch.remarks || '-'}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedBatch(batch)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isEmployee && !selectedBatch && (
        <Card>
          <CardHeader>
            <CardTitle>My Payroll Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month/Year</TableHead>
                  <TableHead>Payroll Account</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Total Earnings</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{format(new Date(record.month + '-01'), 'MM/yyyy')}</TableCell>
                    <TableCell className="text-sm">{record.payrollAccount || '-'}</TableCell>
                    <TableCell>{record.currency}</TableCell>
                    <TableCell className="font-semibold">${record.totalPay.toLocaleString()}</TableCell>
                    <TableCell className="text-green-600">${record.totalEarnings.toLocaleString()}</TableCell>
                    <TableCell className="text-red-600">${record.deductions.toLocaleString()}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedPayslip(record)}
                          >
                            View Payslip
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Payslip Details</DialogTitle>
                            <DialogDescription>
                              View detailed payslip breakdown
                            </DialogDescription>
                          </DialogHeader>
                          {selectedPayslip && (
                            <div className="space-y-6">
                              <div className="text-center border-b pb-4">
                                <h3 className="font-semibold text-lg mb-4">
                                  Year {format(new Date(selectedPayslip.month + '-01'), 'yyyy')} Month {format(new Date(selectedPayslip.month + '-01'), 'MM')} Salary
                                </h3>
                                <div className="text-left space-y-1">
                                  <p className="text-sm">
                                    <span className="text-gray-600">Employee No.:</span>{' '}
                                    <span className="font-medium">{selectedPayslip.employeeId}</span>
                                  </p>
                                  <p className="text-sm">
                                    <span className="text-gray-600">Name:</span>{' '}
                                    <span className="font-medium">
                                      {mockEmployees.find(e => e.id === selectedPayslip.employeeId)?.name}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-600">Earnings</h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-700">Basic Salary</span>
                                    <span className="font-medium">${selectedPayslip.baseSalary.toFixed(2)}</span>
                                  </div>
                                  {selectedPayslip.positionAllowance && selectedPayslip.positionAllowance > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Position Allowance</span>
                                      <span className="font-medium">${selectedPayslip.positionAllowance.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {selectedPayslip.evaluationAllowance && selectedPayslip.evaluationAllowance > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Evaluation Allowance</span>
                                      <span className="font-medium">${selectedPayslip.evaluationAllowance.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {selectedPayslip.otPay > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Overtime Pay</span>
                                      <span className="font-medium">${selectedPayslip.otPay.toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="border-t pt-2 flex justify-between font-semibold">
                                    <span>Total Earnings</span>
                                    <span>${selectedPayslip.totalEarnings.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-600">Deductions</h4>
                                <div className="space-y-2">
                                  {selectedPayslip.firstSalaryDeduction && selectedPayslip.firstSalaryDeduction > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">1st Salary</span>
                                      <span className="font-medium">${selectedPayslip.firstSalaryDeduction.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {selectedPayslip.nssfPension && selectedPayslip.nssfPension > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">NSSF Pension 2%</span>
                                      <span className="font-medium">${selectedPayslip.nssfPension.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {selectedPayslip.taxOnSalary && selectedPayslip.taxOnSalary > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Tax on Salary (TOS)</span>
                                      <span className="font-medium">${selectedPayslip.taxOnSalary.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {selectedPayslip.otherDeductions && selectedPayslip.otherDeductions > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Other Deductions</span>
                                      <span className="font-medium">${selectedPayslip.otherDeductions.toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="border-t pt-2 flex justify-between font-semibold">
                                    <span>Total Deductions</span>
                                    <span>${selectedPayslip.deductions.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="border-t pt-4">
                                <div className="flex justify-between items-center">
                                  <span className="text-lg font-semibold">Net Salary</span>
                                  <span className="text-2xl font-bold text-blue-600">
                                    ${selectedPayslip.totalPay.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <Button
                                onClick={() => handleDownloadPayslip(selectedPayslip.id)}
                                className="w-full"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download PDF
                              </Button>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {payrollRecords.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No payroll records found</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedBatch && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBatch(null)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Batches
                </Button>
                <div>
                  <CardTitle>Payroll Details: {selectedBatch.subject}</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">Month/Year: {selectedBatch.monthYear} | Type: {selectedBatch.type}</p>
                </div>
              </div>
              <Badge className={
                selectedBatch.status === 'approved'
                  ? 'bg-green-100 text-green-800 hover:bg-green-100'
                  : selectedBatch.status === 'processed'
                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                  : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
              }>
                {selectedBatch.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 grid grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold">{selectedBatch.totalEmployees} person</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Net Salary</p>
                <p className="text-2xl font-bold">${selectedBatch.netSalary.toLocaleString()}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold">${selectedBatch.totalEarnings.toLocaleString()}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Deductions</p>
                <p className="text-2xl font-bold">${selectedBatch.deductions.toLocaleString()}</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Payroll Account</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Total Earnings</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRecords.map((record) => {
                  const employee = mockEmployees.find(e => e.id === record.employeeId);
                  return (
                    <TableRow key={record.id}>
                      <TableCell>{record.employeeId}</TableCell>
                      <TableCell className="font-medium">{employee?.name}</TableCell>
                      <TableCell>{employee?.position}</TableCell>
                      <TableCell>{employee?.department}</TableCell>
                      <TableCell className="text-sm">{record.payrollAccount || '-'}</TableCell>
                      <TableCell>{record.currency}</TableCell>
                      <TableCell className="font-semibold">${record.totalPay.toLocaleString()}</TableCell>
                      <TableCell className="text-green-600">${record.totalEarnings.toLocaleString()}</TableCell>
                      <TableCell className="text-red-600">${record.deductions.toLocaleString()}</TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPayslip(record)}
                            >
                              View Payslip
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Payslip Details</DialogTitle>
                              <DialogDescription>
                                View detailed payslip breakdown
                              </DialogDescription>
                            </DialogHeader>
                            {selectedPayslip && (
                              <div className="space-y-6">
                                <div className="text-center border-b pb-4">
                                  <h3 className="font-semibold text-lg mb-4">
                                    Year {format(new Date(selectedPayslip.month + '-01'), 'yyyy')} Month {format(new Date(selectedPayslip.month + '-01'), 'MM')} Salary
                                  </h3>
                                  <div className="text-left space-y-1">
                                    <p className="text-sm">
                                      <span className="text-gray-600">Employee No.:</span>{' '}
                                      <span className="font-medium">{selectedPayslip.employeeId}</span>
                                    </p>
                                    <p className="text-sm">
                                      <span className="text-gray-600">Name:</span>{' '}
                                      <span className="font-medium">
                                        {mockEmployees.find(e => e.id === selectedPayslip.employeeId)?.name}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-gray-600">Earnings</h4>
                                  <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-700">Basic Salary</span>
                                      <span className="font-medium">${selectedPayslip.baseSalary.toFixed(2)}</span>
                                    </div>
                                    {selectedPayslip.positionAllowance && selectedPayslip.positionAllowance > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">Position Allowance</span>
                                        <span className="font-medium">${selectedPayslip.positionAllowance.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {selectedPayslip.evaluationAllowance && selectedPayslip.evaluationAllowance > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">Evaluation Allowance</span>
                                        <span className="font-medium">${selectedPayslip.evaluationAllowance.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {selectedPayslip.otPay > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">Overtime Pay</span>
                                        <span className="font-medium">${selectedPayslip.otPay.toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="border-t pt-2 flex justify-between font-semibold">
                                      <span>Total Earnings</span>
                                      <span>${selectedPayslip.totalEarnings.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-gray-600">Deductions</h4>
                                  <div className="space-y-2">
                                    {selectedPayslip.firstSalaryDeduction && selectedPayslip.firstSalaryDeduction > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">1st Salary</span>
                                        <span className="font-medium">${selectedPayslip.firstSalaryDeduction.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {selectedPayslip.nssfPension && selectedPayslip.nssfPension > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">NSSF Pension 2%</span>
                                        <span className="font-medium">${selectedPayslip.nssfPension.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {selectedPayslip.taxOnSalary && selectedPayslip.taxOnSalary > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">Tax on Salary (TOS)</span>
                                        <span className="font-medium">${selectedPayslip.taxOnSalary.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {selectedPayslip.otherDeductions && selectedPayslip.otherDeductions > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-700">Other Deductions</span>
                                        <span className="font-medium">${selectedPayslip.otherDeductions.toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="border-t pt-2 flex justify-between font-semibold">
                                      <span>Total Deductions</span>
                                      <span>${selectedPayslip.deductions.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="border-t pt-4">
                                  <div className="flex justify-between items-center">
                                    <span className="text-lg font-semibold">Net Salary</span>
                                    <span className="text-2xl font-bold text-blue-600">
                                      ${selectedPayslip.totalPay.toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                <Button
                                  onClick={() => handleDownloadPayslip(selectedPayslip.id)}
                                  className="w-full"
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download PDF
                                </Button>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
