import { useMemo, useState, useEffect } from 'react';
import { loadPayrollCategories } from '../../utils/payrollCategories';
import { useAuth } from '../../context/AuthContext';
import { mockPayroll, mockEmployees } from '../../data/mockData';
import { mockPayrollBatches } from '../../data/settingsData';
import * as payrollApi from '../../api/payroll';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as categoriesApi from '../../api/payrollCategories';
import * as usersApi from '../../api/users';
import { USE_MOCKS } from '../../api/client';
import type { Employee, PayrollItem } from '../../types/hrms';
import type { PayrollBatch, PayrollCategory } from '../../types/settings';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
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
import { DollarSign, Download, FileText, Upload, FileSpreadsheet, Package, ArrowLeft, Calendar, AlertCircle, AlertTriangle, CheckCircle, Clock, Check, X as XIcon, Lock, Wallet, Mail, MessageSquare, Landmark } from 'lucide-react';
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

// ---------------------------------------------------------------------------
// API → UI adapters
// ---------------------------------------------------------------------------
// Adapts a backend Employee to the front-end mock shape used throughout the UI.
// User-facing `id` holds the human-readable empNo; backend UUID is on `apiId`
// and is what the create/approve/reject endpoints expect.
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.empNo,
    apiId: e.id,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
    managerId: e.managerId ?? undefined,
    profileImage: e.profileImage ?? undefined,
    gender: (e.gender === 'male' || e.gender === 'female') ? e.gender : undefined,
    dateOfBirth: e.dateOfBirth ?? undefined,
    placeOfBirth: e.placeOfBirth ?? undefined,
    currentAddress: e.currentAddress ?? undefined,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
  };
}

// Adapts a backend PayrollBatch (api/payroll.PayrollBatch) to the front-end
// PayrollBatch shape (types/settings). Note the field rename: backend sends
// `batchDate`, the UI uses `date`.
function adaptApiBatch(b: payrollApi.PayrollBatch): PayrollBatch {
  // Backend names → front-end names. Backend ships `*ById` UUIDs and
  // `netSalaryTotal` / `totalDeductions`; the UI shape uses `*By` and
  // `netSalary` / `deductions`.
  return {
    id: b.id,
    date: b.batchDate,
    monthYear: b.monthYear,
    type: b.type,
    subject: b.subject,
    totalEmployees: b.totalEmployees,
    currency: b.currency,
    netSalary: b.netSalaryTotal,
    totalEarnings: b.totalEarnings,
    deductions: b.totalDeductions,
    remarks: b.remarks,
    uploadedBy: b.uploadedById,
    uploadedAt: b.uploadedAt,
    status: b.status,
    approvedBy: b.approvedById ?? undefined,
    approvedAt: b.approvedAt ?? undefined,
    completedBy: b.completedById ?? undefined,
    completedAt: b.completedAt ?? undefined,
    rejectedBy: b.rejectedById ?? undefined,
    rejectedAt: b.rejectedAt ?? undefined,
    rejectionReason: b.rejectionReason ?? undefined,
    approverIds: b.approverIds ?? [],
  };
}

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
  // Designated approvers (UUIDs in live mode). Optional, max 3. Empty = any
  // admin (other than uploader) may approve.
  const [batchApproverIds, setBatchApproverIds] = useState<string[]>([]);
  const APPROVER_LIMIT = 3;
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<PayrollBatch | null>(null);
  // Items belonging to the currently-opened batch — fetched on demand from
  // `/payroll/batches/{id}/items`. Adapted to the local PayrollItem shape so
  // the existing detail table + payslip dialog keep rendering as before.
  const [batchItems, setBatchItems] = useState<PayrollItem[]>([]);
  const [batchItemsLoading, setBatchItemsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedPayrollData | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // Batch workflow state — live list (so approvals mutate in place).
  const [batches, setBatches] = useState<PayrollBatch[]>(USE_MOCKS ? mockPayrollBatches : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>([]);
  // Admin users — drive the Approver picker on the Upload Bulk dialog. Only
  // admins have payroll write/approve permission today.
  const [adminUsers, setAdminUsers] = useState<usersApi.User[]>([]);
  // departmentId → name lookup. Adapter stores the raw UUID on
  // `employee.department`; resolve to the readable name everywhere we
  // render to avoid leaking foreign keys into the UI.
  const deptNameById = new Map<string, string>(deptList.map(d => [d.id, d.name]));
  const deptName = (idOrName: string | undefined): string => {
    if (!idOrName || idOrName === '-') return '';
    return deptNameById.get(idOrName) ?? (USE_MOCKS ? idOrName : '');
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loading, setLoading] = useState<boolean>(!USE_MOCKS);
  const [batchStatusTab, setBatchStatusTab] = useState<'all' | PayrollBatchStatus>('all');
  const [approveTarget, setApproveTarget] = useState<PayrollBatch | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PayrollBatch | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [completeTarget, setCompleteTarget] = useState<PayrollBatch | null>(null);
  const [pendingApprovalBatch, setPendingApprovalBatch] = useState<PayrollBatch | null>(null);

  // Per-row delivery selections inside the batch detail table — UI-only for
  // now; bulk-action buttons toast a summary so admins can verify the right
  // rows were picked. Wiring to actual mail/SMS/bank gateways is a backend
  // follow-up. Cleared when the batch closes.
  const [mailSelected, setMailSelected] = useState<Set<string>>(new Set());
  const [smsSelected, setSmsSelected] = useState<Set<string>>(new Set());
  const [bankSelected, setBankSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedBatch) {
      setMailSelected(new Set());
      setSmsSelected(new Set());
      setBankSelected(new Set());
    }
  }, [selectedBatch]);

  const isEmployee = currentUser?.role === 'employee';
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // Dynamic payroll categories — backed by /payroll-categories in live mode
  // and the localStorage helper in mock mode. The Excel template + upload
  // preview both read from this so admin edits in Settings → Payroll
  // Categories drive the columns shown to the user.
  const [categoriesVersion, setCategoriesVersion] = useState(0);
  const [payrollCategories, setPayrollCategories] = useState<PayrollCategory[]>(
    USE_MOCKS ? loadPayrollCategories() : [],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (USE_MOCKS) {
        setPayrollCategories(loadPayrollCategories());
        return;
      }
      try {
        const res = await categoriesApi.list();
        if (cancelled) return;
        setPayrollCategories(res.map(c => ({
          id: c.id, code: c.code, label: c.label, kind: c.kind,
          valueType: c.valueType, defaultAmount: c.defaultAmount,
          order: (c as any).displayOrder ?? c.order ?? 0,
          enabled: c.enabled, system: (c as any).isSystem ?? c.system ?? false,
        })));
      } catch {
        // Non-fatal — template / preview just falls back to localStorage.
        setPayrollCategories(loadPayrollCategories());
      }
    })();
    return () => { cancelled = true; };
  }, [categoriesVersion]);
  const earningCategories = useMemo(
    () => payrollCategories.filter((c) => c.kind === 'earning' && c.enabled).sort((a, b) => a.order - b.order),
    [payrollCategories],
  );
  const deductionCategories = useMemo(
    () => payrollCategories.filter((c) => c.kind === 'deduction' && c.enabled).sort((a, b) => a.order - b.order),
    [payrollCategories],
  );

  // ---------------------------------------------------------------------------
  // Live data loaders
  // ---------------------------------------------------------------------------
  const loadBatches = async () => {
    if (USE_MOCKS) {
      setBatches([...mockPayrollBatches]);
      return;
    }
    try {
      const res = await payrollApi.listBatches({ size: 200 });
      setBatches(res.data.map(adaptApiBatch));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load payroll batches');
    }
  };

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees(res.content.map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  const loadDepartments = async () => {
    if (USE_MOCKS) return;
    try { setDeptList(await departmentsApi.list()); }
    catch { /* dept cells fall back to empty if this fails */ }
  };

  const loadAdminUsers = async () => {
    if (USE_MOCKS) return;
    try {
      // Backend filters by exact role string; admins are the only role with
      // payroll read+write today, so the picker is exactly that list.
      const res = await usersApi.list({ role: 'admin', size: 100 });
      setAdminUsers(res.data.filter(u => u.isActive));
    } catch { /* picker just shows an empty state if this fails */ }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadBatches(), loadEmployees(), loadDepartments(), loadAdminUsers()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the admin opens a batch's detail page we need its actual items —
  // mockPayroll won't match the live employees so the table shows "—" in
  // every identifying column. Fetch the real items, map them onto the
  // local PayrollItem shape, and clear when the batch closes.
  useEffect(() => {
    if (!selectedBatch) {
      setBatchItems([]);
      return;
    }
    if (USE_MOCKS) {
      // In mock mode, fall through to the existing mockPayroll-derived list.
      setBatchItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setBatchItemsLoading(true);
      try {
        const items = await payrollApi.getBatchItems(selectedBatch.id);
        if (cancelled) return;
        setBatchItems(items.map((it): PayrollItem => ({
          id: it.id,
          employeeId: it.employeeId,
          month: it.month ?? selectedBatch.monthYear,
          baseSalary: Number(it.baseSalary ?? 0),
          otHours: Number(it.otHours ?? 0),
          otPay: Number(it.otPay ?? 0),
          deductions: Number(it.deductions ?? 0),
          totalPay: Number(it.netSalary ?? 0),
          totalEarnings: Number(it.totalEarnings ?? 0),
          // The detail dialog reads these breakdown buckets if present.
          extras: (it as any).earnings as Record<string, number> | undefined,
          deductionsExtras: (it as any).deductionsBreakdown as Record<string, number> | undefined,
          payrollAccount: (it as any).payrollAccount,
        } as unknown as PayrollItem)));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load batch items');
      } finally {
        if (!cancelled) setBatchItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBatch]);

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
          knownEmployeeIds: employees.map(e => e.id),
          // Use the live category roster (same source the template generator
          // reads). Without this the parser falls back to the localStorage
          // helper, which can be shorter/stale than the backend list and
          // leads to "Total earnings mismatch" because the last few columns
          // get ignored when summing components.
          categories: payrollCategories,
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

  const resetUploadDialog = () => {
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setBatchName('');
    setPeriodStart('');
    setPeriodEnd('');
    setBatchApproverIds([]);
    setPreviewData(null);
  };

  const commitPayrollUpload = async () => {
    if (!previewData) return;

    if (USE_MOCKS) {
      toast.success(`Payroll batch "${batchName}" uploaded successfully - ${previewData.totalEmployees} employees processed`);
      resetUploadDialog();
      return;
    }

    // Build the API request from parsed Excel preview rows. The backend
    // expects ISO month (YYYY-MM); the dialog captures month + year separately.
    const mm = String(periodStart).padStart(2, '0');
    const yyyy = String(periodEnd);
    const monthYear = `${yyyy}-${mm}`;
    const batchDate = `${yyyy}-${mm}-01`;

    // Map empNo (id) → backend UUID (apiId) for the request payload.
    const empByNo = new Map<string, Employee>();
    employees.forEach(e => empByNo.set(e.id, e));

    const items: payrollApi.CreateBatchItem[] = previewData.employees.map(row => {
      const emp = empByNo.get(row.employeeNo);
      const employeeId = emp?.apiId ?? emp?.id ?? row.employeeNo;
      return {
        employeeId,
        baseSalary: emp?.baseSalary,
        earnings: row.earnings,
        deductionsBreakdown: row.deductions,
      };
    });

    try {
      await payrollApi.createBatch({
        batchDate,
        monthYear,
        type: batchType,
        subject: batchName,
        currency: 'USD',
        approverIds: batchApproverIds.length > 0 ? batchApproverIds : undefined,
        items,
      });
      toast.success(`Payroll batch "${batchName}" submitted for approval - ${previewData.totalEmployees} employees`);
      resetUploadDialog();
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payroll batch');
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

    void commitPayrollUpload();
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

  // Per-employee payroll items aren't reachable via a single endpoint without
  // picking a batch first — `getBatchItems(batchId)` returns items for one
  // batch only. For now, the per-employee Payslips section continues to read
  // `mockPayroll` even in live mode (so admin/manager see something useful);
  // employee role will see an empty list when running against the real API.
  // TODO: wire per-employee items in a follow-up using `getBatchItems(batchId)`
  // (requires letting the user pick a batch, or aggregating across all batches).
  let payrollRecords = isEmployee
    ? mockPayroll.filter(pay => pay.employeeId === currentUser?.employeeId)
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
  const myUserId = currentUser?.id ?? '';

  /**
   * Approve / Reject visibility rules:
   *   - Status must be pending.
   *   - Caller must have role-level approve permission (admin).
   *   - Segregation of duties: caller is not the uploader.
   *   - If the uploader nominated specific approvers, caller must be in
   *     that list. Empty list = open to any other admin.
   * The backend enforces the same checks; this just hides buttons that
   * would only error out.
   */
  const canApproveBatch = (b: PayrollBatch) => {
    if (!canApprove) return false;
    if (b.status !== 'pending') return false;
    // The local PayrollBatch shape uses `uploadedBy` for the user id.
    if (b.uploadedBy === myUserId || b.uploadedBy === myUserEmpId) return false;
    if (Array.isArray(b.approverIds) && b.approverIds.length > 0) {
      return b.approverIds.includes(myUserId);
    }
    return true;
  };
  const canMarkDone = (b: PayrollBatch) =>
    canApprove && b.status === 'approved';
  // Once approved, immutable (corrections go to next run). Currently unused
  // but retained for parity with the mock implementation in case the UI later
  // exposes an "edit pending batch" affordance.
  // const canEdit = (b: PayrollBatch) => b.status === 'pending';

  const requestApproval = (batch: PayrollBatch) => {
    if (batch.uploadedBy === myUserEmpId) {
      toast.error('Segregation of duties: you cannot approve a batch you uploaded.');
      return;
    }
    setPendingApprovalBatch(batch);
    setApproveTarget(batch);
  };

  const performApproval = async () => {
    const target = approveTarget ?? pendingApprovalBatch;
    if (!target) return;

    if (USE_MOCKS) {
      const now = new Date().toISOString();
      setBatches(prev => prev.map(b =>
        b.id === target.id
          ? { ...b, status: 'approved' as PayrollBatchStatus, approvedBy: myUserEmpId, approvedAt: now, rejectedBy: undefined, rejectedAt: undefined, rejectionReason: undefined }
          : b
      ));
      toast.success(`Approved ${target.subject}`);
      setApproveTarget(null);
      setPendingApprovalBatch(null);
      return;
    }

    try {
      await payrollApi.approveBatch(target.id);
      toast.success(`Approved ${target.subject}`);
      setApproveTarget(null);
      setPendingApprovalBatch(null);
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve batch');
    }
  };

  const performReject = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) { toast.error('Provide a reason for rejection'); return; }

    if (USE_MOCKS) {
      const now = new Date().toISOString();
      setBatches(prev => prev.map(b =>
        b.id === rejectTarget.id
          ? { ...b, status: 'rejected' as PayrollBatchStatus, rejectedBy: myUserEmpId, rejectedAt: now, rejectionReason: rejectionReason.trim() }
          : b
      ));
      toast.success(`Rejected ${rejectTarget.subject}`);
      setRejectTarget(null);
      setRejectionReason('');
      return;
    }

    try {
      await payrollApi.rejectBatch(rejectTarget.id, rejectionReason.trim());
      toast.success(`Rejected ${rejectTarget.subject}`);
      setRejectTarget(null);
      setRejectionReason('');
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject batch');
    }
  };

  const performMarkDone = async () => {
    if (!completeTarget) return;

    if (USE_MOCKS) {
      const now = new Date().toISOString();
      setBatches(prev => prev.map(b =>
        b.id === completeTarget.id
          ? { ...b, status: 'done' as PayrollBatchStatus, completedBy: myUserEmpId, completedAt: now }
          : b
      ));
      toast.success(`Marked ${completeTarget.subject} as paid / done`);
      setCompleteTarget(null);
      return;
    }

    try {
      await payrollApi.completeBatch(completeTarget.id);
      toast.success(`Marked ${completeTarget.subject} as paid / done`);
      setCompleteTarget(null);
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark batch as done');
    }
  };

  const handleDownloadTemplate = () => {
    // Use the upload dialog MM/YYYY values, fall back to current month/year.
    const month = periodStart ? String(periodStart).padStart(2, '0') : format(new Date(), 'MM');
    const year = periodEnd || format(new Date(), 'yyyy');
    const monthYear = `${month}-${year}`;

    // Pass the live category roster so the Excel columns match what the
    // admin actually configured under Settings → Payroll Categories.
    downloadPayrollTemplate(employees, monthYear, { categories: payrollCategories });
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

                  <div className="space-y-2">
                    <Label>
                      Approvers <span className="text-xs font-normal text-gray-500">(optional, up to {APPROVER_LIMIT})</span>
                    </Label>
                    <ApproverPicker
                      adminUsers={adminUsers}
                      employees={employees}
                      uploaderUserId={currentUser?.id}
                      value={batchApproverIds}
                      onChange={setBatchApproverIds}
                      max={APPROVER_LIMIT}
                    />
                    <p className="text-xs text-gray-500">
                      Pick up to {APPROVER_LIMIT} admins who may approve or reject this batch. Leave empty to let any admin (other than yourself) handle it.
                    </p>
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
                  employees: employees,
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

      {isAdminOrManager && !selectedBatch && (() => {
        // In live mode, summary cards are sourced from the batches list — the
        // backend DTO already exposes totalEarnings/deductions/netSalary per
        // batch. Mock mode keeps the existing per-item rollup. Note: backend
        // batches don't surface a separate "base salaries" or "OT payments"
        // total, so those tiles fall back to 0 in live mode (deferred to a
        // follow-up that aggregates `getBatchItems(batchId)`).
        const totalPayroll = USE_MOCKS
          ? mockPayroll.reduce((sum, p) => sum + p.totalPay, 0)
          : batches.reduce((sum, b) => sum + b.netSalary, 0);
        const totalBase = USE_MOCKS
          ? mockPayroll.reduce((sum, p) => sum + p.baseSalary, 0)
          : 0;
        const totalOt = USE_MOCKS
          ? mockPayroll.reduce((sum, p) => sum + p.otPay, 0)
          : 0;
        const totalDeductions = USE_MOCKS
          ? mockPayroll.reduce((sum, p) => sum + p.deductions, 0)
          : batches.reduce((sum, b) => sum + b.deductions, 0);
        return (
        <Card>
          <CardHeader>
            <CardTitle>Payroll Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Payroll</p>
                <p className="text-xl font-bold">
                  ${totalPayroll.toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Base Salaries</p>
                <p className="text-xl font-bold">
                  ${totalBase.toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">OT Payments</p>
                <p className="text-xl font-bold">
                  ${totalOt.toLocaleString()}
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Deductions</p>
                <p className="text-xl font-bold">
                  ${totalDeductions.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

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
                  const matchEmp = (uid: string | undefined) =>
                    uid ? employees.find(e => e.id === uid || (e as Employee).apiId === uid) : undefined;
                  const uploader = matchEmp(batch.uploadedBy);
                  const approver = matchEmp(batch.approvedBy);
                  const completer = matchEmp(batch.completedBy);
                  const rejecter = matchEmp(batch.rejectedBy);
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
                        <p>📥 {uploader?.name ?? '—'} · {format(new Date(batch.uploadedAt), 'MMM dd HH:mm')}</p>
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
                            <PayslipBody
                              payslip={selectedPayslip as unknown as AnyPayslip}
                              employees={employees}
                              earningCategories={earningCategories}
                              deductionCategories={deductionCategories}
                              onDownload={handleDownloadPayslip}
                            />
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

            {(() => {
              const detailRows = USE_MOCKS ? payrollRecords : batchItems;
              const allIds = detailRows.map(r => r.id);
              const allChecked = (s: Set<string>) =>
                allIds.length > 0 && allIds.every(id => s.has(id));
              const someChecked = (s: Set<string>) =>
                !allChecked(s) && allIds.some(id => s.has(id));
              const toggleAll = (s: Set<string>, set: (next: Set<string>) => void) => {
                if (allChecked(s)) set(new Set());
                else set(new Set(allIds));
              };
              const toggleOne = (s: Set<string>, set: (next: Set<string>) => void, id: string) => {
                const next = new Set(s);
                if (next.has(id)) next.delete(id); else next.add(id);
                set(next);
              };
              // Bulk action handlers — currently UI-only. Backend wiring is
              // a follow-up (POST /payroll/batches/{id}/dispatch ?channel=mail).
              const dispatch = (channel: 'mail' | 'sms' | 'bank', s: Set<string>) => {
                if (s.size === 0) {
                  toast.warning(`Tick at least one row before sending by ${channel}.`);
                  return;
                }
                const labels: Record<typeof channel, string> = {
                  mail: 'email',
                  sms: 'SMS',
                  bank: 'bank transfer',
                };
                toast.success(`Queued ${s.size} payslip${s.size === 1 ? '' : 's'} for ${labels[channel]}.`);
              };
              return (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                    <span className="text-gray-500">Bulk actions:</span>
                    <Button size="sm" variant="outline" onClick={() => dispatch('mail', mailSelected)}>
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      Send Mail ({mailSelected.size})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => dispatch('sms', smsSelected)}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Send SMS ({smsSelected.size})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => dispatch('bank', bankSelected)}>
                      <Landmark className="h-3.5 w-3.5 mr-1.5" />
                      Push Bank Transfer ({bankSelected.size})
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Position / Department</TableHead>
                        <TableHead>Payroll Account</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Net Salary</TableHead>
                        <TableHead>Total Earnings</TableHead>
                        <TableHead>Deductions</TableHead>
                        <TableHead className="text-center w-20">
                          <div className="flex flex-col items-center gap-1">
                            <Checkbox
                              checked={allChecked(mailSelected) || (someChecked(mailSelected) ? 'indeterminate' : false)}
                              onCheckedChange={() => toggleAll(mailSelected, setMailSelected)}
                              disabled={allIds.length === 0}
                              aria-label="Select all for Mail"
                            />
                            <span className="text-xs">Mail</span>
                          </div>
                        </TableHead>
                        <TableHead className="text-center w-20">
                          <div className="flex flex-col items-center gap-1">
                            <Checkbox
                              checked={allChecked(smsSelected) || (someChecked(smsSelected) ? 'indeterminate' : false)}
                              onCheckedChange={() => toggleAll(smsSelected, setSmsSelected)}
                              disabled={allIds.length === 0}
                              aria-label="Select all for SMS"
                            />
                            <span className="text-xs">SMS</span>
                          </div>
                        </TableHead>
                        <TableHead className="text-center w-24">
                          <div className="flex flex-col items-center gap-1">
                            <Checkbox
                              checked={allChecked(bankSelected) || (someChecked(bankSelected) ? 'indeterminate' : false)}
                              onCheckedChange={() => toggleAll(bankSelected, setBankSelected)}
                              disabled={allIds.length === 0}
                              aria-label="Select all for Bank Transfer"
                            />
                            <span className="text-xs">Bank Transfer</span>
                          </div>
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchItemsLoading ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-400">
                            Loading payroll items…
                          </TableCell>
                        </TableRow>
                      ) : detailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-gray-400">
                            No items in this batch
                          </TableCell>
                        </TableRow>
                      ) : detailRows.map((record) => {
                    const employee = employees.find(e => e.id === record.employeeId || (e as Employee).apiId === record.employeeId);
                    const dept = deptName(employee?.department);
                    return (
                    <TableRow key={record.id}>
                      {/* Combined Employee No + Name. empNo never shows the UUID. */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{employee?.name ?? '—'}</span>
                          <span className="text-[11px] text-gray-500">{employee?.id ?? '—'}</span>
                        </div>
                      </TableCell>
                      {/* Combined Position + Department. */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{employee?.position ?? '—'}</span>
                          <span className="text-[11px] text-gray-500">{dept || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{record.payrollAccount || '-'}</TableCell>
                      <TableCell>{record.currency}</TableCell>
                      <TableCell className="font-semibold">${record.totalPay.toLocaleString()}</TableCell>
                      <TableCell className="text-green-600">${record.totalEarnings.toLocaleString()}</TableCell>
                      <TableCell className="text-red-600">${record.deductions.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={mailSelected.has(record.id)}
                          onCheckedChange={() => toggleOne(mailSelected, setMailSelected, record.id)}
                          aria-label="Send by Mail"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={smsSelected.has(record.id)}
                          onCheckedChange={() => toggleOne(smsSelected, setSmsSelected, record.id)}
                          aria-label="Send by SMS"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={bankSelected.has(record.id)}
                          onCheckedChange={() => toggleOne(bankSelected, setBankSelected, record.id)}
                          aria-label="Push Bank Transfer"
                        />
                      </TableCell>
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
                              <PayslipBody
                                payslip={selectedPayslip as unknown as AnyPayslip}
                                employees={employees}
                                earningCategories={earningCategories}
                                deductionCategories={deductionCategories}
                                onDownload={handleDownloadPayslip}
                              />
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                      })}
                    </TableBody>
                  </Table>
                </>
              );
            })()}
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
                    <p><span className="text-gray-500">Uploaded by:</span> {employees.find(e => e.id === approveTarget.uploadedBy || (e as Employee).apiId === approveTarget.uploadedBy)?.name ?? '—'}</p>
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
// Payslip detail body — drives line items off the live PayrollCategories
// list so the displayed earnings + deductions exactly match what the admin
// configured. Falls back to the legacy fixed allowance fields when the
// item came from mockPayroll (no `extras` / `deductionsExtras` present).
// ---------------------------------------------------------------------------

type AnyPayslip = {
  id: string;
  employeeId: string;
  month: string;
  baseSalary: number;
  otPay: number;
  totalEarnings: number;
  deductions: number;
  totalPay: number;
  // Backend buckets — present when the item came from getBatchItems().
  extras?: Record<string, number>;
  deductionsExtras?: Record<string, number>;
  // Mock-only legacy fields.
  positionAllowance?: number;
  evaluationAllowance?: number;
  firstSalaryDeduction?: number;
  nssfPension?: number;
  taxOnSalary?: number;
  otherDeductions?: number;
};

function derivePayslipLines(
  payslip: AnyPayslip,
  earningCategories: PayrollCategory[],
  deductionCategories: PayrollCategory[],
): { earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[] } {
  const earnings: { label: string; amount: number }[] = [];
  const deductions: { label: string; amount: number }[] = [];

  if (payslip.extras) {
    // Live mode: walk the configured categories in display order; only show
    // rows that are non-zero. Codes the admin removed/disabled don't appear.
    earningCategories.forEach(c => {
      const v = Number(payslip.extras![c.code] ?? 0);
      if (v !== 0) earnings.push({ label: c.label, amount: v });
    });
  } else {
    if (payslip.baseSalary > 0)              earnings.push({ label: 'Basic Salary',         amount: payslip.baseSalary });
    if ((payslip.positionAllowance ?? 0) > 0)   earnings.push({ label: 'Position Allowance',   amount: payslip.positionAllowance! });
    if ((payslip.evaluationAllowance ?? 0) > 0) earnings.push({ label: 'Evaluation Allowance', amount: payslip.evaluationAllowance! });
    if ((payslip.otPay ?? 0) > 0)               earnings.push({ label: 'Overtime Pay',         amount: payslip.otPay });
  }

  if (payslip.deductionsExtras) {
    deductionCategories.forEach(c => {
      const v = Number(payslip.deductionsExtras![c.code] ?? 0);
      if (v !== 0) deductions.push({ label: c.label, amount: v });
    });
  } else {
    if ((payslip.firstSalaryDeduction ?? 0) > 0) deductions.push({ label: '1st Salary',          amount: payslip.firstSalaryDeduction! });
    if ((payslip.nssfPension ?? 0) > 0)          deductions.push({ label: 'NSSF Pension 2%',     amount: payslip.nssfPension! });
    if ((payslip.taxOnSalary ?? 0) > 0)          deductions.push({ label: 'Tax on Salary (TOS)', amount: payslip.taxOnSalary! });
    if ((payslip.otherDeductions ?? 0) > 0)      deductions.push({ label: 'Other Deductions',    amount: payslip.otherDeductions! });
  }
  return { earnings, deductions };
}

function PayslipBody({
  payslip, employees, earningCategories, deductionCategories, onDownload,
}: {
  payslip: AnyPayslip;
  employees: Employee[];
  earningCategories: PayrollCategory[];
  deductionCategories: PayrollCategory[];
  onDownload: (id: string) => void;
}) {
  const employee = employees.find(
    e => e.id === payslip.employeeId || (e as Employee).apiId === payslip.employeeId,
  );
  // empNo is the human-readable identifier — never show the raw UUID.
  const empNo = employee?.id ?? '—';
  const empName = employee?.name ?? '—';
  const { earnings, deductions } = derivePayslipLines(payslip, earningCategories, deductionCategories);

  return (
    <div className="space-y-6">
      <div className="text-center border-b pb-4">
        <h3 className="font-semibold text-lg mb-4">
          Year {format(new Date(payslip.month + '-01'), 'yyyy')} Month {format(new Date(payslip.month + '-01'), 'MM')} Salary
        </h3>
        <div className="text-left space-y-1">
          <p className="text-sm">
            <span className="text-gray-600">Employee No.:</span>{' '}
            <span className="font-medium">{empNo}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-600">Name:</span>{' '}
            <span className="font-medium">{empName}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-600">Earnings</h4>
        <div className="space-y-2">
          {earnings.length === 0 && (
            <p className="text-sm text-gray-400 italic">No earnings recorded.</p>
          )}
          {earnings.map((line, i) => (
            <div key={`e-${i}-${line.label}`} className="flex justify-between text-sm">
              <span className="text-gray-700">{line.label}</span>
              <span className="font-medium">${line.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total Earnings</span>
            <span>${payslip.totalEarnings.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-600">Deductions</h4>
        <div className="space-y-2">
          {deductions.length === 0 && (
            <p className="text-sm text-gray-400 italic">No deductions recorded.</p>
          )}
          {deductions.map((line, i) => (
            <div key={`d-${i}-${line.label}`} className="flex justify-between text-sm">
              <span className="text-gray-700">{line.label}</span>
              <span className="font-medium">${line.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total Deductions</span>
            <span>${payslip.deductions.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold">Net Salary</span>
          <span className="text-2xl font-bold text-blue-600">${payslip.totalPay.toFixed(2)}</span>
        </div>
      </div>

      <Button onClick={() => onDownload(payslip.id)} className="w-full">
        <Download className="mr-2 h-4 w-4" />
        Download PDF
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approver picker — multi-select dropdown bound to active admin users.
// Filters out the uploader (segregation of duties), shows the linked
// employee name when available so the admin recognises faces, not UUIDs.
// ---------------------------------------------------------------------------
function ApproverPicker({
  adminUsers, employees, uploaderUserId, value, onChange, max,
}: {
  adminUsers: usersApi.User[];
  employees: Employee[];
  uploaderUserId: string | undefined;
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
}) {
  const candidates = adminUsers.filter(u => u.id !== uploaderUserId);
  const empByUserId = new Map<string, Employee | undefined>();
  candidates.forEach(u => {
    const link = u.employeeId
      ? employees.find(e => (e as any).apiId === u.employeeId || e.id === u.employeeId)
      : undefined;
    empByUserId.set(u.id, link);
  });

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter(x => x !== id));
      return;
    }
    if (value.length >= max) return;
    onChange([...value, id]);
  };

  const labelFor = (u: usersApi.User) => {
    const emp = empByUserId.get(u.id);
    return emp?.name ?? u.email;
  };

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic px-3 py-2 border rounded-md">
        No other active admins available.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map(id => {
            const u = adminUsers.find(x => x.id === id);
            if (!u) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                {labelFor(u)}
                <button
                  type="button"
                  className="ml-1 rounded hover:bg-gray-200 px-1"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${labelFor(u)}`}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
        {candidates.map(u => {
          const checked = value.includes(u.id);
          const disabled = !checked && value.length >= max;
          return (
            <label
              key={u.id}
              className={`flex items-start gap-2 px-3 py-2 text-sm cursor-pointer ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(u.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{labelFor(u)}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>
            </label>
          );
        })}
      </div>
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
