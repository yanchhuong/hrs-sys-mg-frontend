import { useMemo, useState, useEffect } from 'react';
import { loadPayrollCategories } from '../../utils/payrollCategories';
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
import { EmployeeCell } from '../common/EmployeeCell';
import { DollarSign, Download, FileText, Upload, FileSpreadsheet, Package, ArrowLeft, Calendar, AlertCircle, AlertTriangle, CheckCircle, Clock, Check, X as XIcon, Lock, Wallet } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { PayrollBatchStatus } from '../../types/settings';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { downloadPayrollTemplate } from '../../utils/excelTemplate';
import { parsePayrollExcel, ParsedPayrollData } from '../../utils/excelParser';
import { exportPayrollToExcel } from '../../utils/excelExport';
import { useI18n } from '../../i18n/I18nContext';

export function Payroll() {
  const { t } = useI18n();
  const { currentUser, currentEmployee } = useAuth();
  const [selectedPayslip, setSelectedPayslip] = useState<typeof mockPayroll[0] | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchType, setBatchType] = useState<'Salary' | 'Salary & Bonus' | '1st Salary' | '2nd Salary'>('Salary');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<typeof mockPayrollBatches[0] | null>(null);
  const [previewData, setPreviewData] = useState<ParsedPayrollData | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // Batch workflow state — live list (so approvals mutate in place).
  const [batches, setBatches] = useState(mockPayrollBatches);
  const [batchStatusTab, setBatchStatusTab] = useState<'all' | PayrollBatchStatus>('all');
  const [approveTarget, setApproveTarget] = useState<typeof mockPayrollBatches[0] | null>(null);
  const [rejectTarget, setRejectTarget] = useState<typeof mockPayrollBatches[0] | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [completeTarget, setCompleteTarget] = useState<typeof mockPayrollBatches[0] | null>(null);
  const [pendingApprovalBatch, setPendingApprovalBatch] = useState<typeof mockPayrollBatches[0] | null>(null);

  const isEmployee = currentUser?.role === 'employee';
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // Dynamic payroll categories — reloaded each time the upload dialog opens
  // so admin edits in Settings take effect without a page refresh.
  const [categoriesVersion, setCategoriesVersion] = useState(0);
  const payrollCategories = useMemo(() => loadPayrollCategories(), [categoriesVersion]);
  const earningCategories = useMemo(
    () => payrollCategories.filter((c) => c.kind === 'earning' && c.enabled).sort((a, b) => a.order - b.order),
    [payrollCategories],
  );
  const deductionCategories = useMemo(
    () => payrollCategories.filter((c) => c.kind === 'deduction' && c.enabled).sort((a, b) => a.order - b.order),
    [payrollCategories],
  );

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

  const commitPayrollUpload = () => {
    if (!previewData) return;
    toast.success(`Payroll batch "${batchName}" uploaded successfully - ${previewData.totalEmployees} employees processed`);
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setBatchName('');
    setPeriodStart('');
    setPeriodEnd('');
    setPreviewData(null);
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

    commitPayrollUpload();
  };

  const handleDialogOpenChange = (open: boolean) => {
    setUploadDialogOpen(open);
    if (open) {
      // Re-read categories so edits made in Settings during this session take effect.
      setCategoriesVersion((v) => v + 1);
    }
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

  // ---------------------------------------------------------------------------
  // Batch workflow (Pending → Approved → Done, with Rejection)
  // ---------------------------------------------------------------------------
  const canApprove = currentUser?.role === 'admin';
  const myUserEmpId = currentUser?.employeeId ?? '';

  /** Segregation of duties: approver cannot be the uploader. */
  const canApproveBatch = (b: typeof mockPayrollBatches[0]) =>
    canApprove && b.status === 'pending' && b.uploadedBy !== myUserEmpId;
  const canMarkDone = (b: typeof mockPayrollBatches[0]) =>
    canApprove && b.status === 'approved';
  const canEdit = (b: typeof mockPayrollBatches[0]) =>
    b.status === 'pending';   // once approved, immutable (corrections go to next run)

  const requestApproval = (batch: typeof mockPayrollBatches[0]) => {
    if (batch.uploadedBy === myUserEmpId) {
      toast.error('Segregation of duties: you cannot approve a batch you uploaded.');
      return;
    }
    setPendingApprovalBatch(batch);
    setApproveTarget(batch);
  };

  const performApproval = () => {
    const target = approveTarget ?? pendingApprovalBatch;
    if (!target) return;
    const now = new Date().toISOString();
    setBatches(prev => prev.map(b =>
      b.id === target.id
        ? { ...b, status: 'approved' as PayrollBatchStatus, approvedBy: myUserEmpId, approvedAt: now, rejectedBy: undefined, rejectedAt: undefined, rejectionReason: undefined }
        : b
    ));
    toast.success(`Approved ${target.subject}`);
    setApproveTarget(null);
    setPendingApprovalBatch(null);
  };

  const performReject = () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) { toast.error('Provide a reason for rejection'); return; }
    const now = new Date().toISOString();
    setBatches(prev => prev.map(b =>
      b.id === rejectTarget.id
        ? { ...b, status: 'rejected' as PayrollBatchStatus, rejectedBy: myUserEmpId, rejectedAt: now, rejectionReason: rejectionReason.trim() }
        : b
    ));
    toast.success(`Rejected ${rejectTarget.subject}`);
    setRejectTarget(null);
    setRejectionReason('');
  };

  const performMarkDone = () => {
    if (!completeTarget) return;
    const now = new Date().toISOString();
    setBatches(prev => prev.map(b =>
      b.id === completeTarget.id
        ? { ...b, status: 'done' as PayrollBatchStatus, completedBy: myUserEmpId, completedAt: now }
        : b
    ));
    toast.success(`Marked ${completeTarget.subject} as paid / done`);
    setCompleteTarget(null);
  };

  const handleDownloadTemplate = () => {
    // Use the upload dialog MM/YYYY values, fall back to current month/year.
    const month = periodStart ? String(periodStart).padStart(2, '0') : format(new Date(), 'MM');
    const year = periodEnd || format(new Date(), 'yyyy');
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
          <h1 className="text-3xl font-bold">{t('page.payroll.title')}</h1>
          <p className="text-gray-500">{t('page.payroll.description')}</p>
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
                      <Label htmlFor="batchName">
                        Subject <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="batchName"
                        placeholder="e.g., April 2026 - 1st Half"
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        required
                        aria-required="true"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batchType">Type</Label>
                      <select
                        id="batchType"
                        value={batchType}
                        onChange={(e) => setBatchType(e.target.value as typeof batchType)}
                        className="w-full px-3 py-2 border rounded-md h-9"
                      >
                        <option value="Salary">Salary</option>
                        <option value="Salary & Bonus">Salary &amp; Bonus</option>
                        <option value="1st Salary">1st Salary</option>
                        <option value="2nd Salary">2nd Salary</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Period <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          id="periodStart"
                          type="number"
                          min={1}
                          max={12}
                          placeholder="MM"
                          value={periodStart}
                          onChange={(e) => setPeriodStart(e.target.value)}
                          className="text-center"
                          required
                          aria-required="true"
                        />
                        <span className="block text-xs text-gray-500 text-center">Month (MM)</span>
                      </div>
                      <span className="text-gray-400 text-lg font-medium self-start mt-2">-</span>
                      <div className="flex-1 space-y-1">
                        <Input
                          id="periodEnd"
                          type="number"
                          min={2000}
                          max={2100}
                          placeholder="YYYY"
                          value={periodEnd}
                          onChange={(e) => setPeriodEnd(e.target.value)}
                          className="text-center"
                          required
                          aria-required="true"
                        />
                        <span className="block text-xs text-gray-500 text-center">Year (YYYY)</span>
                      </div>
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
                      <li>• Row 1: Earnings ({earningCategories.map(c => c.label).join(', ') || '—'})</li>
                      <li>• Row 2: Deductions ({deductionCategories.map(c => c.label).join(', ') || '—'})</li>
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
              <DialogContent className="!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !w-screen !h-screen !max-w-none sm:!max-w-none !max-h-none !m-0 !rounded-none p-8 flex flex-col gap-6">
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
                              {earningCategories.map((c) => (
                                <th key={`eh-${c.id}`} className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">{c.label}</th>
                              ))}
                              <th className="px-4 py-3 text-left font-bold text-sm whitespace-nowrap bg-green-100 border-l-2 border-green-300">Total Earnings</th>
                              {deductionCategories.map((c) => (
                                <th key={`dh-${c.id}`} className="px-4 py-3 text-left font-semibold text-sm whitespace-nowrap">{c.label}</th>
                              ))}
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
                                {earningCategories.map((c) => (
                                  <td key={`e-${idx}-${c.id}`} className="px-4 py-3 text-sm whitespace-nowrap">${(emp.earnings?.[c.code] ?? 0).toFixed(2)}</td>
                                ))}
                                <td className="px-4 py-3 text-sm font-bold text-green-700 whitespace-nowrap bg-green-50 border-l-2 border-green-300">${emp.totalEarnings.toFixed(2)}</td>
                                {deductionCategories.map((c) => (
                                  <td key={`d-${idx}-${c.id}`} className="px-4 py-3 text-sm whitespace-nowrap">${(emp.deductions?.[c.code] ?? 0).toFixed(2)}</td>
                                ))}
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

      {isAdminOrManager && !selectedBatch && (() => {
        const statusCounts: Record<'all' | PayrollBatchStatus, number> = {
          all: batches.length,
          pending: batches.filter(b => b.status === 'pending').length,
          approved: batches.filter(b => b.status === 'approved').length,
          done: batches.filter(b => b.status === 'done').length,
          rejected: batches.filter(b => b.status === 'rejected').length,
        };
        const visibleBatches = batchStatusTab === 'all'
          ? [...batches].sort((a, b) => b.date.localeCompare(a.date))
          : [...batches].filter(b => b.status === batchStatusTab).sort((a, b) => b.date.localeCompare(a.date));
        return (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Payroll Batches
                </CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  {statusCounts.pending > 0
                    ? <>Segregation of duties: Manager uploads, Admin approves. <strong>{statusCounts.pending}</strong> batch{statusCounts.pending === 1 ? '' : 'es'} awaiting approval.</>
                    : 'Approved runs are locked — corrections are made in the next run.'}
                </p>
              </div>
              <Tabs value={batchStatusTab} onValueChange={(v) => setBatchStatusTab(v as typeof batchStatusTab)}>
                <TabsList>
                  <TabsTrigger value="all">
                    All
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{statusCounts.all}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="pending">
                    Pending
                    <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{statusCounts.pending}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="approved">
                    Approved
                    <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-blue-100 text-blue-800 hover:bg-blue-100">{statusCounts.approved}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="done">
                    Done
                    <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-green-100 text-green-800 hover:bg-green-100">{statusCounts.done}</Badge>
                  </TabsTrigger>
                  {statusCounts.rejected > 0 && (
                    <TabsTrigger value="rejected">
                      Rejected
                      <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-red-100 text-red-800 hover:bg-red-100">{statusCounts.rejected}</Badge>
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Net Salary</TableHead>
                  <TableHead>Audit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBatches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-gray-400 py-10">
                      No batches in this status.
                    </TableCell>
                  </TableRow>
                )}
                {visibleBatches.map((batch) => {
                  const uploader = mockEmployees.find(e => e.id === batch.uploadedBy);
                  const approver = batch.approvedBy ? mockEmployees.find(e => e.id === batch.approvedBy) : null;
                  const completer = batch.completedBy ? mockEmployees.find(e => e.id === batch.completedBy) : null;
                  const rejecter = batch.rejectedBy ? mockEmployees.find(e => e.id === batch.rejectedBy) : null;
                  const rowTone =
                    batch.status === 'pending'  ? 'bg-yellow-50/40' :
                    batch.status === 'rejected' ? 'bg-red-50/40'    : '';
                  return (
                    <TableRow key={batch.id} className={rowTone}>
                      <TableCell><StatusBadge status={batch.status} /></TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{batch.monthYear}</p>
                        <p className="text-[11px] text-gray-500">{format(new Date(batch.date), 'MMM dd, yyyy')} · {batch.type}</p>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm truncate">{batch.subject}</p>
                        {batch.status === 'rejected' && batch.rejectionReason && (
                          <p className="text-[11px] text-red-700 truncate" title={batch.rejectionReason}>
                            <AlertCircle className="inline h-3 w-3 mr-0.5" />
                            {batch.rejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{batch.totalEmployees}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        ${batch.netSalary.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[11px] text-gray-600 leading-snug">
                        <p>📥 {uploader?.name ?? batch.uploadedBy} · {format(new Date(batch.uploadedAt), 'MMM dd HH:mm')}</p>
                        {approver && batch.approvedAt && (
                          <p>✅ {approver.name} · {format(new Date(batch.approvedAt), 'MMM dd HH:mm')}</p>
                        )}
                        {completer && batch.completedAt && (
                          <p>💰 {completer.name} · {format(new Date(batch.completedAt), 'MMM dd HH:mm')}</p>
                        )}
                        {rejecter && batch.rejectedAt && (
                          <p className="text-red-700">❌ {rejecter.name} · {format(new Date(batch.rejectedAt), 'MMM dd HH:mm')}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedBatch(batch)}>
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                          {canApproveBatch(batch) && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => requestApproval(batch)}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                                onClick={() => { setRejectTarget(batch); setRejectionReason(''); }}
                              >
                                <XIcon className="h-3.5 w-3.5 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {canApprove && batch.status === 'pending' && batch.uploadedBy === myUserEmpId && (
                            <Badge variant="outline" className="h-7 text-[10px] text-gray-500" title="You uploaded this — another admin must approve">
                              <Lock className="h-3 w-3 mr-1" />
                              Needs another admin
                            </Badge>
                          )}
                          {canMarkDone(batch) && (
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setCompleteTarget(batch)}
                            >
                              <Wallet className="h-3.5 w-3.5 mr-1" />
                              Mark Done
                            </Button>
                          )}
                          {batch.status === 'done' && (
                            <Badge variant="outline" className="h-7 text-[10px] text-gray-500" title="Locked — corrections happen in the next run">
                              <Lock className="h-3 w-3 mr-1" />
                              Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        );
      })()}

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
                      <TableCell>
                        <EmployeeCell employee={employee} nameOnly />
                      </TableCell>
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

      {/* Approve batch — confirmation */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve payroll batch?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Once approved, this batch is <strong>locked</strong>. Corrections must be made in the next run via retroactive adjustments.
                </p>
                {approveTarget && (
                  <div className="rounded-md border p-3 bg-gray-50 text-sm space-y-1 text-gray-900">
                    <p><span className="text-gray-500">Batch:</span> <strong>{approveTarget.subject}</strong></p>
                    <p><span className="text-gray-500">Period:</span> {approveTarget.monthYear} · {approveTarget.type}</p>
                    <p><span className="text-gray-500">Employees:</span> {approveTarget.totalEmployees}</p>
                    <p><span className="text-gray-500">Net Salary:</span> <strong>${approveTarget.netSalary.toLocaleString()}</strong></p>
                    <p><span className="text-gray-500">Uploaded by:</span> {mockEmployees.find(e => e.id === approveTarget.uploadedBy)?.name ?? approveTarget.uploadedBy}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performApproval} className="bg-green-600 hover:bg-green-700">
              <Check className="h-4 w-4 mr-2" />
              Approve &amp; Lock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject batch — require a reason */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectionReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject payroll batch?</AlertDialogTitle>
            <AlertDialogDescription>
              The batch is marked Rejected and the uploader is notified. They can revise and re-submit as a new run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Bonus amount for dept X is wrong — please re-upload."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={!rejectionReason.trim()}
            >
              <XIcon className="h-4 w-4 mr-2" />
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Done (payment complete) */}
      <AlertDialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark batch as paid / done?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm that {completeTarget ? `${completeTarget.totalEmployees} employee${completeTarget.totalEmployees === 1 ? '' : 's'} in ${completeTarget.subject}` : 'this batch'} have received their salary. The bank file should already be processed.
              Marking as Done is permanent and writes an audit entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={performMarkDone}>
              <Wallet className="h-4 w-4 mr-2" />
              Mark Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payroll status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: PayrollBatchStatus }) {
  const map: Record<PayrollBatchStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    pending:  { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', Icon: Clock },
    approved: { label: 'Approved', cls: 'bg-blue-100 text-blue-800 hover:bg-blue-100',       Icon: Check },
    done:     { label: 'Done',     cls: 'bg-green-100 text-green-800 hover:bg-green-100',    Icon: Wallet },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800 hover:bg-red-100',          Icon: XIcon },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge className={`${cls} gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
