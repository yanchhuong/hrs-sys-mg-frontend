import { useMemo, useState, useEffect } from 'react';
import { loadPayrollCategories } from '../../utils/payrollCategories';
import { formatMoney } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import { mockPayroll, mockEmployees } from '../../data/mockData';
import { mockPayrollBatches } from '../../data/settingsData';
import * as payrollApi from '../../api/payroll';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as categoriesApi from '../../api/payrollCategories';
import * as usersApi from '../../api/users';
import * as overtimeApi from '../../api/overtime';
import * as deductionsApi from '../../api/deductions';
import * as settingsApi from '../../api/settings';
import * as increasesApi from '../../api/increases';
import * as rolesApi from '../../api/roles';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
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
import { AuditCell } from '../common/AuditCell';
import { DollarSign, Download, FileText, Upload, FileSpreadsheet, Package, ArrowLeft, Calendar, AlertCircle, AlertTriangle, CheckCircle, Circle, Clock, Check, X as XIcon, Lock, Wallet, Mail, MessageSquare, Landmark, Scale, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
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
import { exportPayrollToExcel, PAYROLL_TEMPLATES, PayrollTemplate } from '../../utils/excelExport';
import {
  splitOtRequestByDay, defaultDayTypeRateFor, computeOtPay,
} from '../../utils/otRates';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { SeniorityIndemnityDialog } from './SeniorityIndemnityDialog';
import { TaxCalculatorDialog } from './TaxCalculatorDialog';

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
    // TOS dependents inputs — without these the TaxCalculator dialog
    // and the payroll auto-fill always see 0 dependents regardless of
    // what HR set on the Employee profile.
    maritalStatus: (e.maritalStatus === 'single' || e.maritalStatus === 'married' || e.maritalStatus === 'divorced' || e.maritalStatus === 'widowed') ? e.maritalStatus : undefined,
    numberOfChildren: e.numberOfChildren ?? 0,
    decouple: e.decouple ?? false,
    claimSpouse: e.claimSpouse ?? false,
    // Standing earnings (V43): both NOT NULL DEFAULT 0 on the server,
    // coerced to 0 here so the "1st Salary" formula and the payslip line
    // items always have a number to work with.
    positionAllowance: e.positionAllowance ?? 0,
    evaluationAllowance: e.evaluationAllowance ?? 0,
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
    uploadedByName: b.uploadedByName ?? undefined,
    uploadedAt: b.uploadedAt,
    status: b.status,
    approvedBy: b.approvedById ?? undefined,
    approvedByName: b.approvedByName ?? undefined,
    approvedAt: b.approvedAt ?? undefined,
    completedBy: b.completedById ?? undefined,
    completedByName: b.completedByName ?? undefined,
    completedAt: b.completedAt ?? undefined,
    rejectedBy: b.rejectedById ?? undefined,
    rejectedByName: b.rejectedByName ?? undefined,
    rejectedAt: b.rejectedAt ?? undefined,
    rejectionReason: b.rejectionReason ?? undefined,
    approverIds: b.approverIds ?? [],
  };
}

// Codes whose dollar value comes from a formula, not from a fixed
// number HR enters. We mark them with an info icon next to the label
// so admins don't accidentally type an override into the spreadsheet.
const FORMULA_DEDUCTION_HINTS: Record<string, string> = {
  first_salary: 'Formula: (Basic Salary + Position Allowance + Evaluation Allowance) ÷ 2. The amount is computed per employee and auto-filled on the 2nd Salary payslip — not a fixed number.',
  nssf:         'Formula: contributoryKhr = min(gross × khrPerUsd, 1,200,000) ; nssfUsd = (contributoryKhr × 2%) ÷ khrPerUsd. Capped at 1.2M KHR contributory wage; manual non-zero override on a salary_deductions row wins.',
  tax:          'Cambodia TOS — progressive brackets (0% / 5% / 10% / 15% / 20%) applied to gross × khrPerUsd minus 150,000 KHR per dependent. Formula: taxKhr = taxable × ratePercent − excessAmount; auto-filled by the payroll generator, manual override on a salary_deductions row wins.',
};
const FORMULA_EARNING_HINTS: Record<string, string> = {
  first_salary: 'Formula: (Basic Salary + Position Allowance + Evaluation Allowance) ÷ 2. The amount is computed per employee — not a fixed number you enter on the spreadsheet.',
};

function FormulaHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-amber-600 cursor-help"
            aria-label="Formula-driven"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Payroll() {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const { currentUser, currentEmployee, canUpdate } = useAuth();
  const [selectedPayslip, setSelectedPayslip] = useState<typeof mockPayroll[0] | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  /** Which flow opened the dialog. 'upload' = old Excel roundtrip;
   *  'generate' = direct POST via handleGeneratePayroll. Drives the
   *  dialog title and hides the Excel picker + parse preview when we're
   *  generating directly so HR isn't distracted by upload-only widgets. */
  const [uploadDialogMode, setUploadDialogMode] = useState<'upload' | 'generate'>('upload');
  // Cambodian Seniority Indemnity dialog — June/December payment calculator.
  // Generates a payroll batch carrying a single 'seniority_indemnity' line
  // per eligible UDC employee. See SeniorityIndemnityDialog for the rules.
  const [seniorityDialogOpen, setSeniorityDialogOpen] = useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchType, setBatchType] = useState<'One Time Salary' | '1st Salary' | '2nd Salary'>('One Time Salary');
  // Period defaults to the current month / year so HR doesn't have to
  // type the same MM / YYYY into every batch they create. The dialog
  // re-applies these defaults on open (see handleDialogOpenChange) so
  // a batch generated next month picks up the new month automatically.
  const currentMm   = format(new Date(), 'MM');
  const currentYyyy = format(new Date(), 'yyyy');
  const [periodStart, setPeriodStart] = useState(currentMm);
  const [periodEnd, setPeriodEnd] = useState(currentYyyy);
  // Designated approvers (UUIDs in live mode). Optional, max 3. Empty = any
  // admin (other than uploader) may approve.
  const [batchApproverIds, setBatchApproverIds] = useState<string[]>([]);
  const APPROVER_LIMIT = 3;
  // Per-batch "include this column" toggles. Codes present in this set are
  // EXCLUDED from the template download AND the parsed data — when the user
  // unchecks a column we hide it from the spreadsheet they download AND
  // force the value to 0 if it sneaks back in via a paste from another
  // file. Empty by default = every enabled category is included.
  const [excludedCodes, setExcludedCodes] = useState<Set<string>>(new Set());
  // Tax-on-Salary brackets + FX rate, used to pre-fill the Tax column on
  // the downloaded template. Loaded once on mount; in mock mode we ship a
  // hard-coded mirror of the NBC defaults so the math still demos.
  const [taxSettings, setTaxSettings] = useState<settingsApi.PayrollTaxSettings | null>(null);
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
  // render to avoid leaking foreign keys into the UI. Stale UUIDs (dept
  // deleted) collapse to '' rather than show through.
  const deptName = makeDeptName(deptList, '');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loading, setLoading] = useState<boolean>(!USE_MOCKS);
  const [batchStatusTab, setBatchStatusTab] = useState<'all' | PayrollBatchStatus>('all');
  const [approveTarget, setApproveTarget] = useState<PayrollBatch | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PayrollBatch | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [completeTarget, setCompleteTarget] = useState<PayrollBatch | null>(null);
  const [pendingApprovalBatch, setPendingApprovalBatch] = useState<PayrollBatch | null>(null);

  // Single-row selection inside the batch detail table. The Mail / SMS /
  // Bank Transfer columns flip from "No" to "Yes" once that row has been
  // dispatched on that channel — bulk dispatch always skips rows already
  // marked Yes, so admins can't accidentally double-send. State is
  // frontend-only for now (resets on page reload); backend persistence is
  // a follow-up (a `payroll_dispatches` log table).
  // Self-payslip records loaded from the backend in live mode for
  // employee/manager roles (mockPayroll has empNo-style ids that never
  // match the live UUID). Empty array = "no records" — same as before.
  const [myPayrollItems, setMyPayrollItems] = useState<payrollApi.PayrollItem[]>([]);
  // Admin-scope payroll items for live mode. Loaded across the last 12
  // months by the effect below. Without this, the admin's table + Excel
  // export both fall back to `mockPayroll`, which is seeded with empNos
  // (EMP001..EMP043) that don't exist in the real tenant — so every row
  // except the seeded admin shows "-" for name / dept / position.
  const [adminPayrollItems, setAdminPayrollItems] = useState<payrollApi.PayrollItem[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [sentMail, setSentMail] = useState<Set<string>>(new Set());
  const [sentSms, setSentSms] = useState<Set<string>>(new Set());
  const [sentBank, setSentBank] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedBatch) {
      setSelectedRowIds(new Set());
      setSentMail(new Set());
      setSentSms(new Set());
      setSentBank(new Set());
    }
  }, [selectedBatch]);

  const role = currentUser?.role;
  const isEmployee = role === 'employee';
  // "Self-payslip view" — both Employee and built-in Manager see only their
  // own payroll records. Manager keeps team scope on Attendance/OT/Leave
  // elsewhere; Payroll is treated as sensitive comp data.
  const isSelfPayslipView = role === 'employee' || role === 'manager';
  // Admin + custom roles see the batch-management surface. The previous
  // {@code isAdminOrManager} included Manager — now Manager is demoted to
  // self-only since their team-payroll wasn't authorised by the matrix.
  const isAdminOrManager =
    role === 'admin' || (!!role && role !== 'manager' && role !== 'employee');

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
  // Earning categories shown in the Upload Payroll Batch dialog. For a
  // "1st Salary" mid-month batch only the two valid earnings appear —
  // 1st Salary itself and an optional Bonus. The other codes (OT, Meal,
  // Petrol, Seniority Indemnity, …) belong to the end-of-month batch
  // and stay hidden so the spreadsheet template generator can't be
  // tricked into including them.
  const FIRST_SALARY_ALLOWED = new Set(['first_salary', 'bonus']);
  // Synthetic "Employee field" earnings — Basic / Position / Evaluation
  // live on the Employee record (NOT NULL DEFAULT 0 since V43) and have
  // no row in payroll_categories. They still need to appear on the
  // Upload-dialog Earnings checkbox list so HR can include/exclude their
  // columns from the Excel template just like the real categories.
  // Built once, prepended to the visible list below.
  const EMPLOYEE_FIELD_EARNINGS: PayrollCategory[] = useMemo(() => ([
    { id: '__basic__',      code: 'basic',      label: 'Basic Salary',         kind: 'earning', valueType: 'flat', defaultAmount: 0, order: -3, enabled: true, system: true },
    { id: '__position__',   code: 'position',   label: 'Position Allowance',   kind: 'earning', valueType: 'flat', defaultAmount: 0, order: -2, enabled: true, system: true },
    { id: '__evaluation__', code: 'evaluation', label: 'Evaluation Allowance', kind: 'earning', valueType: 'flat', defaultAmount: 0, order: -1, enabled: true, system: true },
  ]), []);
  // Seniority Indemnity is paid twice a year per Cambodian Labour Law:
  // the June and December cycles only. Restrict the Earnings column to
  // those months on a Salary / 2nd Salary batch — every other (batch
  // type, month) combination hides it. Mid-month (1st Salary) batches
  // never carry seniority.
  const isSeniorityMonth = periodStart === '6' || periodStart === '06'
                        || periodStart === '12';
  const isSeniorityAllowedBatchType = batchType === '2nd Salary' || batchType === 'One Time Salary';
  const isSeniorityAllowed = isSeniorityAllowedBatchType && isSeniorityMonth;

  const uploadEarningCategories = useMemo(() => {
    // On a "1st Salary" mid-month batch only first_salary + bonus apply —
    // Basic / Position / Evaluation are part of the 2nd-half (full)
    // payslip and are intentionally hidden here.
    if (batchType === '1st Salary') {
      return earningCategories.filter(c => FIRST_SALARY_ALLOWED.has(c.code.toLowerCase()));
    }
    const withSeniorityFilter = earningCategories.filter(c =>
      c.code.toLowerCase() !== 'seniority_indemnity' || isSeniorityAllowed,
    );
    return [...EMPLOYEE_FIELD_EARNINGS, ...withSeniorityFilter];
  }, [earningCategories, batchType, EMPLOYEE_FIELD_EARNINGS, isSeniorityAllowed]);

  // Full category list (earnings + deductions) that downloadPayrollTemplate
  // and the upload parser both consume. Filtering is done by (kind, code)
  // here — NOT by `excludedCodes` alone — because the same `code`
  // ('first_salary') exists on both the earning and deduction sides, so
  // a code-only Set can't distinguish them. The rules:
  //   • 1st Salary batch  — earnings: first_salary + bonus only;
  //                         no deductions render on a mid-month payslip.
  //   • 2nd Salary batch  — drop the first_salary EARNING; keep the
  //                         first_salary DEDUCTION (clawback).
  //   • Salary / Salary & Bonus — drop first_salary on BOTH sides.
  // Per-batch `excludedCodes` filters this further at the call site.
  const templateCategories = useMemo(() => {
    const filtered = payrollCategories.filter(c => {
      if (c.kind === 'earning') {
        if (batchType === '1st Salary') {
          return FIRST_SALARY_ALLOWED.has(c.code.toLowerCase());
        }
        // first_salary EARNING only belongs on a mid-month batch.
        if (c.code.toLowerCase() === 'first_salary') return false;
        // Seniority Indemnity only on Salary / 2nd Salary of Jun or Dec.
        if (c.code.toLowerCase() === 'seniority_indemnity' && !isSeniorityAllowed) return false;
        return true;
      }
      if (c.kind === 'deduction') {
        if (batchType === '1st Salary') return false;
        if (c.code.toLowerCase() === 'first_salary') {
          return batchType === '2nd Salary';
        }
        return true;
      }
      return true;
    });
    return batchType === '1st Salary'
      ? filtered
      : [...EMPLOYEE_FIELD_EARNINGS, ...filtered];
  }, [payrollCategories, batchType, EMPLOYEE_FIELD_EARNINGS, isSeniorityAllowed]);

  // Keep excludedCodes in sync with the per-batch-type rules:
  //   • "1st Salary"  — only first_salary + bonus earnings; all
  //                     deductions auto-excluded (mid-month payslip
  //                     carries no tax / NSSF / 1st Salary clawback).
  //   • "2nd Salary"  — every earning enabled; deductions enabled and
  //                     the first_salary clawback row force-included
  //                     so HR can't accidentally uncheck it.
  //   • other types   — first_salary deduction force-excluded (no
  //                     prior 1st-half batch to claw back).
  useEffect(() => {
    setExcludedCodes(prev => {
      const next = new Set(prev);
      let changed = false;
      if (batchType === '1st Salary') {
        for (const c of earningCategories) {
          if (FIRST_SALARY_ALLOWED.has(c.code.toLowerCase())) continue;
          if (!next.has(c.code)) { next.add(c.code); changed = true; }
        }
        for (const c of deductionCategories) {
          if (!next.has(c.code)) { next.add(c.code); changed = true; }
        }
      } else if (batchType === '2nd Salary') {
        // Make sure the clawback DEDUCTION row is INCLUDED (not
        // excluded) — drop it from excludedCodes if a previous
        // batch-type selection happened to push it in.
        const fsDed = deductionCategories.find(c => c.code.toLowerCase() === 'first_salary')?.code;
        if (fsDed && next.has(fsDed)) { next.delete(fsDed); changed = true; }
        // Force-exclude the 1st Salary EARNING — it only belongs on a
        // mid-month batch and would double-count if HR somehow checked
        // it here. The checkbox is also disabled in the UI below.
        const fsEarn = earningCategories.find(c => c.code.toLowerCase() === 'first_salary')?.code;
        if (fsEarn && !next.has(fsEarn)) { next.add(fsEarn); changed = true; }
      } else {
        // "Salary" / "Salary & Bonus" — single-payment monthly. There
        // is no 1st-half batch to deduct, so force-exclude both the
        // 1st Salary earning AND the clawback deduction.
        const fsDed = deductionCategories.find(c => c.code.toLowerCase() === 'first_salary')?.code;
        if (fsDed && !next.has(fsDed)) { next.add(fsDed); changed = true; }
        const fsEarn = earningCategories.find(c => c.code.toLowerCase() === 'first_salary')?.code;
        if (fsEarn && !next.has(fsEarn)) { next.add(fsEarn); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [batchType, earningCategories, deductionCategories]);
  // True when deductions should be visible-but-uncheckable on the
  // Upload Payroll Batch dialog (mid-month '1st Salary' batch only).
  const deductionsLocked = batchType === '1st Salary';

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
      // Approver candidates = built-in Admin + every Custom Role whose
      // permission grid grants Payroll access. Built-in Manager and
      // Employee never qualify (the V4 seed denies them payroll
      // create/update). Filtered down to active users so suspended
      // accounts can't be picked.
      const usersRes = await usersApi.list({ size: 200 });
      const activeUsers = usersRes.data.filter(u => u.isActive);

      const eligibleRoleKeys = new Set<string>(['admin']);
      try {
        const roles = await rolesApi.list();
        const customKeys = roles.filter(r => !r.isBuiltin).map(r => r.key);
        const grids = await Promise.all(
          customKeys.map(async key => ({
            key,
            grid: await rolesApi.getPermissions(key).catch(() => []),
          })),
        );
        for (const { key, grid } of grids) {
          if (grid.some(p => p.module === 'payroll' && p.granted)) {
            eligibleRoleKeys.add(key);
          }
        }
      } catch {
        // Roles endpoint failed — fall back to admin-only candidates so
        // the picker still works (matches the previous behaviour).
      }

      setAdminUsers(activeUsers.filter(u => eligibleRoleKeys.has(u.role)));
    } catch { /* picker just shows an empty state if this fails */ }
  };

  // Tax brackets + FX rate. Loaded separately from the main settings burst
  // so the page still renders if Settings → Tax Brackets has never been
  // opened (the GET self-heals with NBC defaults on first read).
  useEffect(() => {
    if (USE_MOCKS) {
      // Mock mode mirror of the NBC defaults so the template's tax column
      // still pre-fills when running off the seed data.
      setTaxSettings({
        khrPerUsd: 4100,
        brackets: [
          { fromAmount: 0,        toAmount: 1500000,  ratePercent: 0,  excessAmount: 0,       sortOrder: 1 },
          { fromAmount: 1500001,  toAmount: 2000000,  ratePercent: 5,  excessAmount: 75000,   sortOrder: 2 },
          { fromAmount: 2000001,  toAmount: 8500000,  ratePercent: 10, excessAmount: 175000,  sortOrder: 3 },
          { fromAmount: 8500001,  toAmount: 12500000, ratePercent: 15, excessAmount: 600000,  sortOrder: 4 },
          { fromAmount: 12500001, toAmount: null,     ratePercent: 20, excessAmount: 1225000, sortOrder: 5 },
        ],
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await settingsApi.getPayrollTaxSettings();
        if (!cancelled) setTaxSettings(s);
      } catch {
        // Fail silent — Tax column just falls back to 0 if the endpoint
        // is unreachable. The admin can still adjust by hand in Excel.
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // Self-payslip loader. For Employee / Manager roles in live mode, fetch
  // the user's own payroll items across the last 12 months and store them
  // for the My Payroll Records card. Re-runs when the role / employee
  // identity changes (e.g. login). Mock mode falls through and the
  // existing `mockPayroll` filter handles it.
  useEffect(() => {
    if (USE_MOCKS || !isSelfPayslipView || !currentUser?.employeeId) {
      setMyPayrollItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // Last 12 months of YYYY-MM strings (newest first).
      const months: string[] = [];
      const cursor = new Date();
      for (let i = 0; i < 12; i++) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
        cursor.setMonth(cursor.getMonth() - 1);
      }
      try {
        const results = await Promise.all(
          months.map(month =>
            payrollApi.listItemsByMonth(month, currentUser.employeeId).catch(() => [])),
        );
        if (cancelled) return;
        const flat = results.flat();
        // Filter again client-side as a safety net — backend already
        // narrowed by employeeId, but keeps us defensive against an
        // endpoint quirk that returns the whole batch.
        setMyPayrollItems(flat.filter(it => it.employeeId === currentUser.employeeId));
      } catch {
        if (!cancelled) setMyPayrollItems([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelfPayslipView, currentUser?.employeeId]);

  // Admin tenant-wide loader. Mirrors the self-view loader above but
  // omits the employeeId filter so we get every employee's items for the
  // last 12 months. Re-runs only on role change — month / year filters
  // are applied client-side downstream (`payrollRecords` filter block).
  useEffect(() => {
    if (USE_MOCKS || isSelfPayslipView) {
      setAdminPayrollItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const months: string[] = [];
      const cursor = new Date();
      for (let i = 0; i < 12; i++) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
        cursor.setMonth(cursor.getMonth() - 1);
      }
      try {
        const results = await Promise.all(
          months.map(month => payrollApi.listItemsByMonth(month).catch(() => [])),
        );
        if (cancelled) return;
        setAdminPayrollItems(results.flat());
      } catch {
        if (!cancelled) setAdminPayrollItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isSelfPayslipView]);

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
        // Hydrate the per-channel "sent" sets from the persisted timestamps
        // so a page reload doesn't reset every Yes back to No. Empty when
        // the column is null (= not yet sent on that channel).
        setSentMail(new Set(items.filter(it => it.mailSentAt).map(it => it.id)));
        setSentSms(new Set(items.filter(it => it.smsSentAt).map(it => it.id)));
        setSentBank(new Set(items.filter(it => it.bankSentAt).map(it => it.id)));
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
          // Filter out codes the admin unchecked for this batch — those
          // columns are not part of the WABOOKS layout we just generated,
          // so any value the user pasted into them is intentionally ignored
          // (treated as 0).
          categories: templateCategories.filter(c => !excludedCodes.has(c.code)),
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
    // Reset Period to the CURRENT month / year (not blank) so the
    // next open of the dialog presents sensible defaults instead of
    // forcing HR to re-type the date for every batch.
    setPeriodStart(format(new Date(), 'MM'));
    setPeriodEnd(format(new Date(), 'yyyy'));
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
      // Reset all states when dialog closes. Period falls back to the
      // current month / year — see resetUploadDialog for the rationale.
      setSelectedFile(null);
      setBatchName('');
      setPeriodStart(format(new Date(), 'MM'));
      setPeriodEnd(format(new Date(), 'yyyy'));
      setPreviewData(null);
      setPreviewDialogOpen(false);
      setExcludedCodes(new Set());
      // Default back to upload mode so the next click on the
      // DialogTrigger (Upload Bulk Payroll button) reopens cleanly.
      setUploadDialogMode('upload');
    }
  };

  // Per-employee payroll items aren't reachable via a single endpoint without
  // picking a batch first — `getBatchItems(batchId)` returns items for one
  // batch only. For now, the per-employee Payslips section continues to read
  // `mockPayroll` even in live mode (so admin/manager see something useful);
  // employee role will see an empty list when running against the real API.
  // TODO: wire per-employee items in a follow-up using `getBatchItems(batchId)`
  // (requires letting the user pick a batch, or aggregating across all batches).
  // Payroll scope rules (also see {@link isSelfPayslipView}):
  //   • Employee  → own payslips only.
  //   • Manager   → own payslips only (members' compensation is sensitive
  //                 and isn't surfaced even though manager sees member
  //                 attendance / OT / leave elsewhere).
  //   • Admin + custom roles → full tenant view.
  // In live mode the self view is sourced from {@link myPayrollItems}
  // (loaded by the backend per-month effect above) and adapted to the
  // mock {@code PayrollItem} shape the table renderer expects. Mock mode
  // continues to filter the seed array by empNo.
  // Adapter: backend PayrollItem → local PayrollItem-ish row used by the
  // table, payslip dialog, and Excel export. Same shape used for self view
  // and admin tenant-wide view — the only difference is whether the item
  // list was prefiltered by employeeId server-side.
  const adaptBackendItem = (it: payrollApi.PayrollItem): typeof mockPayroll[number] => ({
    id: it.id,
    employeeId: it.employeeId,
    month: it.month,
    baseSalary: it.baseSalary,
    positionAllowance: 0,
    evaluationAllowance: 0,
    otHours: it.otHours ?? 0,
    otPay: it.otPay ?? 0,
    firstSalaryDeduction: 0,
    nssfPension: 0,
    taxOnSalary: 0,
    otherDeductions: 0,
    deductions: it.deductions,
    totalPay: it.netSalary,
    totalEarnings: it.totalEarnings,
    payrollAccount: it.payrollAccount ?? '-',
    currency: it.currency ?? 'USD',
    generatedAt: it.generatedAt ?? `${it.month}-01T00:00:00`,
    approvedBy: '',
    // Forward the per-category breakdown so the Payslip dialog renders the
    // same line items the Admin sees. The dialog's PayslipBody reads
    // `extras` / `deductionsExtras`; the FE PayrollItem stores the same
    // shape under `earnings` / `deductionsBreakdown` — copy under both
    // keys so either reader resolves.
    earnings: it.earnings,
    deductionsBreakdown: it.deductionsBreakdown,
    extras: it.earnings,
    deductionsExtras: it.deductionsBreakdown,
    // Backend already resolves the employee name server-side; preserve it
    // so the export / table can fall back to it when the local Employee
    // lookup misses (e.g. terminated employees not in the active list).
    employeeName: it.employeeName,
    // Owning batch subject (e.g. "1st Salary of May") — surfaced in
    // the Subject column and the Payslip Details header.
    batchSubject: it.batchSubject,
  } as unknown as typeof mockPayroll[number]);

  let payrollRecords: typeof mockPayroll = isSelfPayslipView
    ? (USE_MOCKS
        ? mockPayroll.filter(pay => pay.employeeId === currentUser?.employeeId)
        : myPayrollItems.map(adaptBackendItem))
    : (USE_MOCKS ? mockPayroll : adminPayrollItems.map(adaptBackendItem));

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

  /**
   * Opens the existing Bulk Payroll dialog in generate mode — same
   * Subject / Period / Type / Approvers / Earning + Deduction toggles
   * HR uses for an Excel upload, but the Generate button at the bottom
   * POSTs the batch directly instead of going through the spreadsheet
   * roundtrip. The actual composition runs in handleComposeBatch('generate').
   */
  const handleGeneratePayroll = () => {
    setUploadDialogMode('generate');
    setUploadDialogOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Batch workflow (Pending → Approved → Done, with Rejection)
  // ---------------------------------------------------------------------------
  // Approve/Reject is driven by the Permission Matrix, not a hardcoded
  // role check. Matches the backend's @perm.allow('payroll','update') —
  // any role with payroll:update granted (admin or a custom role with
  // the toggle on) can act, provided the per-batch rules below pass.
  const canApprove = canUpdate('payroll');
  const myUserEmpId = currentUser?.employeeId ?? '';
  const myUserId = currentUser?.id ?? '';

  /**
   * Approve / Reject visibility rules:
   *   - Status must be pending.
   *   - Caller must have payroll:update granted in the Permission Matrix.
   *   - Segregation of duties: caller is not the uploader.
   *   - If the uploader nominated specific approvers, caller must be in
   *     that list. Empty list = open to any user with payroll:update.
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

  /**
   * Shared composer behind both "Download Excel Template" and the new
   * "Generate Payroll" flow. Builds the same earnings / deductions
   * maps the upload dialog would produce, then either:
   *   - mode='download' → writes the .xlsx the existing Bulk Upload
   *     consumes (HR fills + uploads),
   *   - mode='generate' → POSTs the batch directly to
   *     payrollApi.createBatch so HR can skip the Excel roundtrip.
   * Keeping one composer guarantees the downloaded template and the
   * directly-generated batch always carry identical numbers — Tax /
   * NSSF / 1st-Salary clawback / 2nd-Salary clawback etc.
   */
  const handleComposeBatch = async (mode: 'download' | 'generate') => {
    // Use the upload dialog MM/YYYY values, fall back to current month/year.
    const month = periodStart ? String(periodStart).padStart(2, '0') : format(new Date(), 'MM');
    const year = periodEnd || format(new Date(), 'yyyy');
    const monthYear = `${month}-${year}`;
    const periodFromIso = `${year}-${month}-01`;
    const periodEndDay = new Date(Number(year), Number(month), 0).getDate(); // last day of month
    const periodToIso = `${year}-${month}-${String(periodEndDay).padStart(2, '0')}`;

    // Only active employees in the template — terminated / inactive rows
    // would just clutter the upload sheet with zero-amount lines.
    const activeEmployees = employees.filter(e => e.status === 'active');

    // Resolve the canonical earnings codes (basic / allowances / ot) from
    // the live category list. Match by code first, fall back to label
    // (case-insensitive) so admins who renamed the labels still get values
    // routed correctly.
    const earningCode = (predicates: ((c: typeof payrollCategories[number]) => boolean)[]) =>
      payrollCategories.find(c =>
        c.kind === 'earning' && c.enabled && predicates.some(p => p(c)),
      )?.code ?? null;

    // Basic / Position / Evaluation no longer have payroll-category rows
    // (V43); the values come straight off the Employee record. We still
    // place them under stable internal keys in the earnings map so the
    // backend's totalEarnings sum stays correct.
    const BASIC_KEY      = 'basic';
    const POSITION_KEY   = 'position';
    const EVALUATION_KEY = 'evaluation';
    // '1st Salary' is the new earning category seeded in V43. On a "1st
    // Salary" batch it's the only line we emit; on any other batch it
    // stays absent.
    const firstSalaryCode = earningCode([
      c => c.code.toLowerCase() === 'first_salary',
      c => c.label.toLowerCase().startsWith('1st'),
    ]);
    const otCode = earningCode([
      c => c.code.toLowerCase() === 'ot',
      c => c.label.toLowerCase().startsWith('ot'),
      c => c.label.toLowerCase().includes('overtime'),
    ]);
    // True when the admin selected the mid-month "1st Salary" batch type.
    // Drives the split-pay payslip layout: a single 1st-Salary line in
    // place of Basic + Position + Evaluation.
    const isFirstSalaryBatch = batchType === '1st Salary';
    // True when this is the end-of-month "2nd Salary" batch — the
    // payslip then carries full earnings AND deducts back the half
    // that was paid in the prior 1st Salary batch.
    const isSecondSalaryBatch = batchType === '2nd Salary';

    // Tax-on-Salary code on the deduction side. Used to pre-fill the Tax
    // column from the configured Cambodia TOS brackets so HR doesn't have
    // to paste tax values into 100 rows by hand.
    const taxCode = payrollCategories.find(c =>
      c.kind === 'deduction'
      && c.enabled
      && (c.code.toLowerCase() === 'tax' || c.label.toLowerCase().startsWith('tax'))
    )?.code ?? null;
    // '1st Salary' on the DEDUCTION side (V44 seed). Same code as the
    // earning, different `kind` row. Used to clawback the mid-month
    // advance on the 2nd Salary payslip.
    const firstSalaryDeductionCode = payrollCategories.find(c =>
      c.kind === 'deduction' && c.enabled && c.code.toLowerCase() === 'first_salary'
    )?.code ?? null;
    // NSSF Pension — employee portion (2% during the first 5 years per
    // Cambodian NSSF). Computed deterministically below so HR doesn't
    // have to enter dollar values by hand and so manual mistakes can't
    // drift from the legal schedule.
    const nssfDeductionCode = payrollCategories.find(c =>
      c.kind === 'deduction' && c.enabled && c.code.toLowerCase() === 'nssf'
    )?.code ?? null;

    /**
     * Apply the configured progressive brackets to a USD gross amount and
     * return the tax in USD (rounded to 2 decimals). Returns 0 when tax
     * settings haven't loaded, the FX rate is unset, or no bracket
     * matches. Dependents reduce the taxable base by KHR 150,000 each
     * (Cambodia TOS rule). Caller is responsible for resolving dependent
     * count from {@link Employee.maritalStatus} / {@link Employee.numberOfChildren}.
     */
    const computeTosUsd = (grossUsd: number, dependents: number): number => {
      if (!taxSettings || !(taxSettings.khrPerUsd > 0)) return 0;
      if (!taxSettings.brackets || taxSettings.brackets.length === 0) return 0;
      const grossKhr = grossUsd * taxSettings.khrPerUsd;
      const taxableKhr = Math.max(0, grossKhr - dependents * 150000);
      const sorted = [...taxSettings.brackets].sort((a, b) => Number(a.fromAmount) - Number(b.fromAmount));
      const bracket = sorted.find(b => {
        const from = Number(b.fromAmount);
        const to = b.toAmount == null ? null : Number(b.toAmount);
        return taxableKhr >= from && (to == null || taxableKhr <= to);
      });
      if (!bracket) return 0;
      const taxKhr = Math.max(
        0,
        (taxableKhr * Number(bracket.ratePercent) / 100) - Number(bracket.excessAmount),
      );
      return Math.round((taxKhr / Number(taxSettings.khrPerUsd)) * 100) / 100;
    };

    /**
     * Employee NSSF pension contribution in USD.
     *
     * Per Cambodian NSSF: 2% of the **contributory wage**, where the
     * contributory wage is capped at **1,200,000 KHR/month**. Apply the
     * cap in KHR, take the 2%, then convert back to USD at the tenant's
     * configured FX rate. Returns 0 if the FX rate isn't set yet —
     * matches the existing TOS behaviour and avoids silently writing
     * implausible numbers on a fresh tenant.
     *
     * The 5-year pension escalation (rate climbs to 8% total after
     * year 5 and beyond) is NOT modelled — revisit per the project
     * memory on Cambodia NSSF when the escalation date is configurable.
     */
    const NSSF_CONTRIBUTORY_CAP_KHR = 1_200_000;
    const NSSF_EMPLOYEE_RATE = 0.02; // 2% — employee pension portion, first 5 years
    const computeNssfUsd = (grossUsd: number): number => {
      if (!taxSettings || !(taxSettings.khrPerUsd > 0)) return 0;
      const grossKhr = grossUsd * taxSettings.khrPerUsd;
      const contributoryKhr = Math.min(grossKhr, NSSF_CONTRIBUTORY_CAP_KHR);
      const nssfKhr = contributoryKhr * NSSF_EMPLOYEE_RATE;
      return Math.round((nssfKhr / Number(taxSettings.khrPerUsd)) * 100) / 100;
    };

    /** Dependents = (claimSpouse ? 1 : 0) + numberOfChildren — both
     *  gated by the top-level `decouple` flag.
     *
     *  V53 (`decouple`)    gates the whole claim — when false, no
     *                       dependents are subtracted on this payslip.
     *  V55 (`claimSpouse`) is the explicit spouse line. Independent of
     *                       maritalStatus so a widowed / divorced single
     *                       parent with custody can keep their children
     *                       deduction without a phantom spouse line. */
    const dependentsFor = (e: Employee): number => {
      if (!e.decouple) return 0;
      const spouse = e.claimSpouse ? 1 : 0;
      const children = e.numberOfChildren ?? 0;
      return spouse + children;
    };

    // OT pay = (baseSalary / 160) * hours * multiplier. 160 = 20 working
    // days × 8 hours. Multipliers come from the tenant's OT settings
    // (Attendance → OT Rules) — workday / weekend / holiday + the V58
    // night-work overlay. Defaults fall back to the Cambodian Labour Law
    // baselines (1.5× / 2× / 3× and 1.3× night) if the call fails.
    let otCfg: {
      weekday: number; weekend: number; holiday: number;
      nightEnabled: boolean; nightRate: number; nightStart: string; nightEnd: string;
      nightCompose: 'replace' | 'max' | 'multiply';
    } = {
      weekday: 1.5, weekend: 2, holiday: 3,
      nightEnabled: true, nightRate: 1.3, nightStart: '22:00', nightEnd: '05:00',
      nightCompose: 'replace',
    };
    if (!USE_MOCKS) {
      try {
        const s = await settingsApi.getOtSettings();
        const nested = (k: keyof settingsApi.OtSettings): number | undefined => {
          const v = (s[k] as Record<string, unknown> | undefined)?.rate;
          return typeof v === 'number' && v > 0 ? v : undefined;
        };
        otCfg = {
          weekday: nested('workdayRule') ?? (Number(s.weekdayRate) || 1.5),
          weekend: nested('weekendRule') ?? (Number(s.weekendRate) || 2),
          holiday: nested('holidayRule') ?? (Number(s.holidayRate) || 3),
          nightEnabled: s.nightEnabled ?? true,
          nightRate:    Number(s.nightRate)   || 1.3,
          nightStart:   (s.nightStartTime ?? '22:00').slice(0, 5),
          nightEnd:     (s.nightEndTime   ?? '05:00').slice(0, 5),
          nightCompose: (s.nightCompose === 'max' || s.nightCompose === 'multiply' || s.nightCompose === 'replace')
            ? s.nightCompose
            : 'replace',
        };
      } catch (err) {
        console.warn('Could not load OT settings — using Cambodian Labour Law defaults', err);
      }
    }
    // Per-day bucketed pay (V59). A cross-midnight OT splits at 24:00
    // and each bucket gets its own day-type + night overlay; same-day
    // OT collapses to one bucket so this matches the legacy 1.5/2/3
    // path on existing rows.
    const otPayFor = (
      baseSalary: number,
      hours: number,
      isWeekend: boolean,
      isHoliday: boolean,
      startHour?: string,
      endHour?: string,
      startDate?: string,
      endDate?: string,
      rateOverride?: number | null,
    ) => {
      if (!baseSalary || !hours) return 0;
      const segments = splitOtRequestByDay({
        startDate: startDate ?? '',
        startHour: startHour ?? '',
        endDate:   endDate   ?? startDate ?? '',
        endHour:   endHour   ?? '',
        totalHours: hours,
      });
      const rateOf = defaultDayTypeRateFor({
        weekdayRate: otCfg.weekday,
        weekendRate: otCfg.weekend,
        holidayRate: otCfg.holiday,
        holidayDates: isHoliday && startDate ? new Set([startDate]) : undefined,
      });
      return computeOtPay({
        hourlyWage: baseSalary / 160,
        segments,
        dayTypeRateFor: rateOf,
        nightEnabled: otCfg.nightEnabled,
        nightRate: otCfg.nightRate,
        nightStart: otCfg.nightStart,
        nightEnd: otCfg.nightEnd,
        nightCompose: otCfg.nightCompose,
        rateOverride: rateOverride ?? undefined,
      });
    };

    // Pull approved OT + active deductions + increases overlapping the
    // period. All three are paged endpoints; cap at 1000 rows which is
    // comfortably more than any single tenant produces in a month.
    let otRows: overtimeApi.OtRequest[] = [];
    let deductionRows: deductionsApi.SalaryDeduction[] = [];
    let increaseRows: increasesApi.SalaryIncrease[] = [];
    if (!USE_MOCKS) {
      try {
        const [otRes, dedRes, incRes] = await Promise.all([
          overtimeApi.list({
            status: 'approved',
            from: periodFromIso,
            to: periodToIso,
            size: 1000,
          }),
          deductionsApi.list({
            status: 'active',
            from: periodFromIso,
            to: periodToIso,
            size: 1000,
          }),
          // Increase rows are filtered server-side by effectiveDate falling
          // inside [from, to] — i.e. only events that hit this month count.
          // Past increases that already raised baseSalary aren't summed
          // again here; they're already baked into the employee record.
          increasesApi.list({
            from: periodFromIso,
            to: periodToIso,
            size: 1000,
          }),
        ]);
        otRows = otRes.data;
        deductionRows = dedRes.data;
        increaseRows = incRes.data;
      } catch (err) {
        // Non-fatal — the template still downloads, just without the
        // computed OT / deduction / increase columns.
        console.warn('Could not preload OT / deductions / increases for template', err);
      }
    }

    // Build per-employee OT pay totals. Match against either id form
    // because the OT row's employeeId is a backend UUID while the FE
    // Employee uses empNo as id and apiId for the UUID.
    const otTotalByApiId = new Map<string, number>();
    for (const r of otRows) {
      otTotalByApiId.set(
        r.employeeId,
        (otTotalByApiId.get(r.employeeId) ?? 0) + Number(r.hours || 0) * 0, // placeholder; replaced below
      );
    }
    // Re-walk now that we know the full set of approved rows so each row
    // can find its employee's baseSalary for the multiplier formula.
    otTotalByApiId.clear();
    for (const r of otRows) {
      const emp = activeEmployees.find(
        e => (e as { apiId?: string }).apiId === r.employeeId || e.id === r.employeeId,
      );
      if (!emp) continue;
      const apiId = (emp as { apiId?: string }).apiId ?? emp.id;
      const pay = otPayFor(
        emp.baseSalary || 0,
        Number(r.hours || 0),
        r.isWeekend,
        r.isHoliday,
        (r as { startHour?: string }).startHour,
        (r as { endHour?: string }).endHour,
        r.date,
        (r as { endDate?: string }).endDate,
        (r as { rateOverride?: number | null }).rateOverride ?? undefined,
      );
      otTotalByApiId.set(apiId, (otTotalByApiId.get(apiId) ?? 0) + pay);
    }

    // Build deduction sums keyed by (employee apiId → category code → amount).
    // The deduction.type field is free text; we lowercase-match it against
    // the category code so a row of type 'advance' lands under the
    // 'advance' deduction column even if the admin wrote 'Advance'.
    const deductionsByApiId = new Map<string, Record<string, number>>();
    for (const d of deductionRows) {
      const emp = activeEmployees.find(
        e => (e as { apiId?: string }).apiId === d.employeeId || e.id === d.employeeId,
      );
      if (!emp) continue;
      const apiId = (emp as { apiId?: string }).apiId ?? emp.id;
      const code = (d.type ?? '').toLowerCase().trim();
      if (!code) continue;
      const bucket = deductionsByApiId.get(apiId) ?? {};
      bucket[code] = (bucket[code] ?? 0) + Number(d.amount || 0);
      deductionsByApiId.set(apiId, bucket);
    }

    // Same shape as deductionsByApiId but for the earning side. Drives
    // every earning column other than the reserved ones (basic /
    // position / evaluation / ot / first_salary). A salary increase of
    // type='bonus' for $50 lands under the 'Bonus' earning column for
    // that employee.
    const reservedEarningCodes = new Set(
      [BASIC_KEY, POSITION_KEY, EVALUATION_KEY, otCode, firstSalaryCode]
        .filter((c): c is string => !!c),
    );
    const increasesByApiId = new Map<string, Record<string, number>>();
    for (const inc of increaseRows) {
      const emp = activeEmployees.find(
        e => (e as { apiId?: string }).apiId === inc.employeeId || e.id === inc.employeeId,
      );
      if (!emp) continue;
      const apiId = (emp as { apiId?: string }).apiId ?? emp.id;
      const code = (inc.type ?? '').toLowerCase().trim();
      if (!code) continue;
      // Skip rows that target the reserved built-in earnings — those are
      // owned by the employee record / OT module and shouldn't be
      // double-counted from an increase row.
      if (reservedEarningCodes.has(code)) continue;
      // Day-unit rows store a day count, not dollars — summing them as
      // money would silently corrupt the column (a 7.5-day seniority entry
      // would land as $7.50 in the template). The Compute Seniority
      // Indemnity dialog owns the dollar math for those.
      if (inc.unit === 'day') continue;
      const bucket = increasesByApiId.get(apiId) ?? {};
      bucket[code] = (bucket[code] ?? 0) + Number(inc.amount || 0);
      increasesByApiId.set(apiId, bucket);
    }

    // Compose the override maps keyed by Employee.id (the empNo) since
    // that's what the template util uses to render rows. Layered fill:
    //   1. start with Increase amounts (Bonus, Meal, Petrol, …)
    //   2. then write the standing earnings (Basic / Position / Evaluation
    //      / OT) on top so a stray Increase row with one of those codes
    //      can't override the canonical Employee value.
    //   3. for the mid-month "1st Salary" batch, replace the three
    //      standing earnings with a single first_salary line equal to
    //      (basic + position + evaluation) / 2.
    const earningsByEmployee: Record<string, Record<string, number>> = {};
    const deductionsByEmployee: Record<string, Record<string, number>> = {};
    for (const emp of activeEmployees) {
      const apiId = (emp as { apiId?: string }).apiId ?? emp.id;
      const earnRow: Record<string, number> = { ...(increasesByApiId.get(apiId) ?? {}) };
      const base = emp.baseSalary || 0;
      const pa   = (emp as { positionAllowance?: number }).positionAllowance ?? 0;
      const ea   = (emp as { evaluationAllowance?: number }).evaluationAllowance ?? 0;

      if (isFirstSalaryBatch) {
        // Split-pay mid-month payslip: single "1st Salary" line at 50%
        // of the standing earnings. Other increases (bonus / meal / …)
        // typically don't apply mid-month; they remain in earnRow if
        // they were attached on a 1st-half date, but the three standing
        // earnings are intentionally absent.
        const firstSalary = Math.round(((base + pa + ea) / 2) * 100) / 100;
        if (firstSalaryCode) earnRow[firstSalaryCode] = firstSalary;
      } else {
        earnRow[BASIC_KEY]      = base;
        earnRow[POSITION_KEY]   = pa;
        earnRow[EVALUATION_KEY] = ea;
      }
      if (otCode)        earnRow[otCode]        = Math.round((otTotalByApiId.get(apiId) ?? 0) * 100) / 100;
      // Seniority Indemnity is computed by the dedicated "Compute
      // Seniority Indemnity" dialog (June + December). The category
      // default is a day count (7.5), which the template util would
      // otherwise print verbatim into the dollar column. Force it to
      // 0 here so the cell stays blank until HR populates it via the
      // dedicated flow — even when the column is visible.
      earnRow['seniority_indemnity'] = 0;
      earningsByEmployee[emp.id] = earnRow;

      // Start the deduction bucket from any pre-existing manual rows the
      // admin captured under Settings → Deductions, then layer the
      // computed Tax-on-Salary and NSSF on top. We only set the
      // formula-driven rows when the bucket doesn't already have a
      // non-zero value, so manual overrides win.
      const dedBucket: Record<string, number> = { ...(deductionsByApiId.get(apiId) ?? {}) };
      const grossUsd = Object.values(earnRow).reduce(
        (s, n) => s + (Number.isFinite(Number(n)) ? Number(n) : 0),
        0,
      );
      if (taxCode && !(dedBucket[taxCode] > 0)) {
        dedBucket[taxCode] = computeTosUsd(grossUsd, dependentsFor(emp));
      }
      // NSSF — 2% of min(gross_khr, 1,200,000 KHR cap), converted back
      // to USD. Same "don't stomp manual" guard as Tax so an HR-entered
      // override (e.g. catch-up for a missed month) survives the
      // automatic fill.
      if (nssfDeductionCode && !(dedBucket[nssfDeductionCode] > 0)) {
        dedBucket[nssfDeductionCode] = computeNssfUsd(grossUsd);
      }
      // 2nd Salary clawback: deduct the half already paid mid-month so
      // the take-home only reflects the remaining half. Recomputed from
      // the formula rather than read from the prior batch, per the
      // user's "recompute" decision — keeps the flow deterministic even
      // if no 1st-half batch exists.
      if (isSecondSalaryBatch && firstSalaryDeductionCode) {
        dedBucket[firstSalaryDeductionCode] = Math.round(((base + pa + ea) / 2) * 100) / 100;
      }
      deductionsByEmployee[emp.id] = dedBucket;
    }

    if (mode === 'download') {
      // Pass the live category roster so the Excel columns match what the
      // admin actually configured under Settings → Payroll Categories. Drop
      // any codes the admin unchecked on this batch's "Include columns"
      // panel so the spreadsheet stays tight.
      downloadPayrollTemplate(activeEmployees, monthYear, {
        categories: templateCategories.filter(c => !excludedCodes.has(c.code)),
        earningsByEmployee,
        deductionsByEmployee,
      });
      toast.success(
        `Payroll template downloaded — ${activeEmployees.length} active employees`
          + (otRows.length ? `, ${otRows.length} OT entries` : '')
          + (increaseRows.length ? `, ${increaseRows.length} increase entries` : '')
          + (deductionRows.length ? `, ${deductionRows.length} deduction entries` : ''),
      );
      return;
    }
    // 'generate' mode — short-circuit the Excel roundtrip and POST the
    // batch directly with the same auto-computed amounts. Validation
    // mirrors the upload-confirm path (Subject + Period required) so a
    // sloppy click doesn't generate "Untitled" batches.
    if (!batchName.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!periodStart || !periodEnd) {
      toast.error('Period (Month + Year) is required');
      return;
    }
    const items: payrollApi.CreateBatchItem[] = activeEmployees.map(emp => ({
      employeeId: (emp as { apiId?: string }).apiId ?? emp.id,
      baseSalary: emp.baseSalary,
      earnings: earningsByEmployee[emp.id] ?? {},
      deductionsBreakdown: deductionsByEmployee[emp.id] ?? {},
    }));
    try {
      await payrollApi.createBatch({
        batchDate: `${year}-${month}-01`,
        monthYear,
        type: batchType,
        subject: batchName.trim(),
        currency: 'USD',
        approverIds: batchApproverIds.length > 0 ? batchApproverIds : undefined,
        items,
      });
      toast.success(`Payroll batch "${batchName}" generated for ${activeEmployees.length} employees`);
      resetUploadDialog();
      await loadBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate payroll batch');
    }
  };

  // Thin wrapper so existing call sites keep their name. The actual
  // Generate-Payroll button (page header) opens the dialog; the dialog's
  // bottom Generate button then runs handleComposeBatch('generate').
  const handleDownloadTemplate = () => handleComposeBatch('download');

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
            <Button variant="outline" onClick={() => setSeniorityDialogOpen(true)}>
              <Scale className="mr-2 h-4 w-4" />
              Calculate Seniority
            </Button>
            <SeniorityIndemnityDialog
              open={seniorityDialogOpen}
              onOpenChange={setSeniorityDialogOpen}
              onCreated={() => { void loadBatches(); }}
            />
            <Button variant="outline" onClick={() => setTaxDialogOpen(true)}>
              <Scale className="mr-2 h-4 w-4" />
              Calculate Tax
            </Button>
            <TaxCalculatorDialog
              open={taxDialogOpen}
              onOpenChange={(open) => {
                setTaxDialogOpen(open);
                // Refresh employees whenever the dialog opens so changes
                // saved on the Employees page (decouple / maritalStatus /
                // numberOfChildren) flow into the TOS preview without a
                // manual page refresh.
                if (open) void loadEmployees();
              }}
              employees={employees}
              taxSettings={taxSettings}
            />
            <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setUploadDialogMode('upload')}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Bulk Payroll
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                  <DialogTitle>
                    {uploadDialogMode === 'generate' ? 'Generate Payroll Batch' : 'Upload Payroll Batch'}
                  </DialogTitle>
                  <DialogDescription>
                    {uploadDialogMode === 'generate'
                      ? 'Auto-fill from Employee record + OT + Increases — no Excel roundtrip.'
                      : 'Upload Excel file with payroll data for multiple employees'}
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
                        <option value="One Time Salary">One Time Salary</option>
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
                      Pick up to {APPROVER_LIMIT} admins who may approve or reject this batch. <strong>Leave empty to auto-approve on upload</strong> (useful when no second admin is available).
                    </p>
                  </div>

                  {uploadDialogMode === 'upload' && (
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
                  )}

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
                                ${formatMoney(totalNet)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Total Earnings</p>
                              <p className={`text-lg font-bold ${totalEarnings === 0 ? 'text-gray-400' : 'text-green-600'}`}>
                                ${formatMoney(totalEarnings)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Total Deductions</p>
                              <p className={`text-lg font-bold ${totalDeductions === 0 ? 'text-gray-400' : 'text-red-600'}`}>
                                ${formatMoney(totalDeductions)}
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
                                      <td className="text-right px-3 py-2 whitespace-nowrap text-green-700">${formatMoney(emp.totalEarnings)}</td>
                                      <td className="text-right px-3 py-2 whitespace-nowrap text-red-700">${formatMoney(emp.totalDeductions)}</td>
                                      <td className={`text-right px-3 py-2 whitespace-nowrap font-semibold ${emp.netSalary < 0 ? 'text-red-700' : ''}`}>${formatMoney(emp.netSalary)}</td>
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

                  {/* Template format + per-batch column toggles. The two
                      checkbox panels stand in for the old "Row 1 / Row 2"
                      bullets — same information, no duplication. Toggling
                      a column hides it from the downloaded template and
                      forces parsed values to 0 if it sneaks back in. */}
                  <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-blue-900">
                        Format (Two-Row Stacked)
                      </p>
                      <p className="text-xs text-blue-700">
                        Each employee = 2 rows · Columns A/B/C merged
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Row 1 — Earnings */}
                      <div className="rounded-md border border-blue-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Row 1</span>
                            <span className="text-sm font-semibold text-gray-800">Earnings</span>
                          </div>
                          <button
                            type="button"
                            className="text-[11px] text-blue-700 hover:underline"
                            onClick={() => setExcludedCodes(prev => {
                              const next = new Set(prev);
                              const allIncluded = uploadEarningCategories.every(c => !next.has(c.code));
                              if (allIncluded) uploadEarningCategories.forEach(c => next.add(c.code));
                              else uploadEarningCategories.forEach(c => next.delete(c.code));
                              return next;
                            })}
                          >
                            {uploadEarningCategories.every(c => !excludedCodes.has(c.code)) ? 'Clear all' : 'Select all'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {uploadEarningCategories.map(c => {
                            // The 1st Salary earning is only valid on a
                            // mid-month "1st Salary" batch. On every other
                            // type (Salary / 2nd Salary / Salary & Bonus)
                            // it stays force-excluded AND uncheckable, so
                            // HR can't accidentally double-count it.
                            const isFsEarning = c.code.toLowerCase() === 'first_salary';
                            const locked = isFsEarning && batchType !== '1st Salary';
                            // When locked we always render as unchecked,
                            // regardless of what's in excludedCodes — the
                            // sync useEffect can lag if categories
                            // haven't loaded yet (e.g. cloud backend that
                            // doesn't have V43), so the visual must not
                            // depend on it alone.
                            const included = !locked && !excludedCodes.has(c.code);
                            return (
                              <label
                                key={c.code}
                                className={`flex items-center gap-2 text-sm text-gray-700 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                              >
                                <Checkbox
                                  checked={included}
                                  disabled={locked}
                                  onCheckedChange={(v) => {
                                    setExcludedCodes(prev => {
                                      const next = new Set(prev);
                                      if (v) next.delete(c.code); else next.add(c.code);
                                      return next;
                                    });
                                  }}
                                />
                                <span className={included ? '' : 'line-through text-gray-400'}>{c.label}</span>
                                {FORMULA_EARNING_HINTS[c.code.toLowerCase()] && (
                                  <FormulaHint text={FORMULA_EARNING_HINTS[c.code.toLowerCase()]} />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Row 2 — Deductions */}
                      <div className="rounded-md border border-blue-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Row 2</span>
                            <span className="text-sm font-semibold text-gray-800">Deductions</span>
                          </div>
                          <button
                            type="button"
                            disabled={deductionsLocked}
                            className="text-[11px] text-blue-700 hover:underline disabled:no-underline disabled:text-gray-400 disabled:cursor-not-allowed"
                            onClick={() => setExcludedCodes(prev => {
                              const next = new Set(prev);
                              const allIncluded = deductionCategories.every(c => !next.has(c.code));
                              if (allIncluded) deductionCategories.forEach(c => next.add(c.code));
                              else deductionCategories.forEach(c => next.delete(c.code));
                              return next;
                            })}
                          >
                            {deductionCategories.every(c => !excludedCodes.has(c.code)) ? 'Clear all' : 'Select all'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {deductionCategories.map(c => {
                            // The 1st Salary clawback only belongs on a
                            // 2nd Salary batch. On every other type
                            // (1st Salary, Salary, Salary & Bonus) the
                            // checkbox is greyed out + force-excluded
                            // so HR can't accidentally deduct the
                            // half-paid advance from a batch that
                            // didn't have one.
                            const isFsDed = c.code.toLowerCase() === 'first_salary';
                            const fsDedLocked = isFsDed && batchType !== '2nd Salary';
                            const locked = deductionsLocked || fsDedLocked;
                            // Same defensive computation as the earnings
                            // panel: when locked we always render as
                            // unchecked so a stale excludedCodes set
                            // can't leak a phantom check mark through.
                            const included = !locked && !excludedCodes.has(c.code);
                            return (
                              <label
                                key={c.code}
                                className={`flex items-center gap-2 text-sm text-gray-700 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                              >
                                <Checkbox
                                  checked={included}
                                  disabled={locked}
                                  onCheckedChange={(v) => {
                                    setExcludedCodes(prev => {
                                      const next = new Set(prev);
                                      if (v) next.delete(c.code); else next.add(c.code);
                                      return next;
                                    });
                                  }}
                                />
                                <span className={included ? '' : 'line-through text-gray-400'}>{c.label}</span>
                                {FORMULA_DEDUCTION_HINTS[c.code.toLowerCase()] && (
                                  <FormulaHint text={FORMULA_DEDUCTION_HINTS[c.code.toLowerCase()]} />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>

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
                      <span className="text-xs text-gray-400">
                        {uploadDialogMode === 'generate'
                          ? 'Auto-fills from Employee record + OT + Increases on Generate'
                          : 'Select a file to preview'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => setUploadDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    {uploadDialogMode === 'generate' ? (
                      <Button
                        onClick={() => handleComposeBatch('generate')}
                        disabled={!batchName.trim() || !periodStart || !periodEnd}
                        title={!batchName.trim() || !periodStart || !periodEnd
                          ? 'Subject + Period are required'
                          : undefined}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Payroll
                      </Button>
                    ) : (
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
                    )}
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
                          ${formatMoney(previewData.employees.reduce((sum, emp) => sum + emp.totalEarnings, 0))}
                        </p>
                      </div>
                      <div className="bg-blue-50 p-6 rounded-lg">
                        <p className="text-sm text-gray-600 mb-2">Total Net Salary</p>
                        <p className="text-3xl font-bold text-blue-600">
                          ${formatMoney(previewData.employees.reduce((sum, emp) => sum + emp.netSalary, 0))}
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
                                  <td key={`e-${idx}-${c.id}`} className="px-4 py-3 text-sm whitespace-nowrap">${formatMoney(emp.earnings?.[c.code] ?? 0)}</td>
                                ))}
                                <td className="px-4 py-3 text-sm font-bold text-green-700 whitespace-nowrap bg-green-50 border-l-2 border-green-300">${formatMoney(emp.totalEarnings)}</td>
                                {deductionCategories.map((c) => (
                                  <td key={`d-${idx}-${c.id}`} className="px-4 py-3 text-sm whitespace-nowrap">${formatMoney(emp.deductions?.[c.code] ?? 0)}</td>
                                ))}
                                <td className="px-4 py-3 text-sm font-bold text-red-700 whitespace-nowrap bg-red-50 border-l-2 border-red-300">${formatMoney(emp.totalDeductions)}</td>
                                <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap bg-blue-50 border-l-2 border-blue-300 ${emp.netSalary < 0 ? 'text-red-700' : 'text-blue-700'}`}>${formatMoney(emp.netSalary)}</td>
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

            {/* Template-aware export. Each bank publishes its own bulk-payment
                Excel format, so let the user pick before generating. The
                Standard report is the legacy multi-sheet HR file; bank
                templates (ABA, ACLEDA, Wing) produce a single beneficiary
                list ready to upload to the bank portal. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export Excel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Choose export template</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PAYROLL_TEMPLATES.map((tpl, i) => (
                  <div key={tpl.id}>
                    {i === 1 && <DropdownMenuSeparator />}
                    {i === 2 && (
                      <DropdownMenuLabel className="text-xs text-gray-400 font-normal pt-2">
                        Bank portals (draft)
                      </DropdownMenuLabel>
                    )}
                    <DropdownMenuItem
                      className="flex flex-col items-start gap-0.5 py-2"
                      onClick={() => {
                        const periodLabel =
                          selectedYear !== 'all' && selectedMonth !== 'all' ? `${selectedYear}-${selectedMonth}` :
                          selectedYear !== 'all' ? selectedYear :
                          'All';
                        exportPayrollToExcel({
                          payrollItems: payrollRecords,
                          employees,
                          period: periodLabel,
                          template: tpl.id as PayrollTemplate,
                          deptName,
                        });
                        if (tpl.draft) {
                          toast.warning(
                            `${tpl.label} (draft) — exported ${payrollRecords.length} records. Verify columns before uploading to the portal.`,
                          );
                        } else {
                          toast.success(`Exported ${payrollRecords.length} records (${tpl.label})`);
                        }
                      }}
                    >
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        {tpl.label}
                        {tpl.draft && (
                          <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            draft
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-500">{tpl.description}</span>
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Generate Payroll is a 3-way dropdown — picking an option
                sets the batch type and opens the upload dialog in
                generate mode so HR jumps straight to a pre-typed batch
                without flipping the Type select inside the dialog. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Payroll
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(['1st Salary', '2nd Salary', 'One Time Salary'] as const).map(opt => (
                  <DropdownMenuItem
                    key={opt}
                    onClick={() => {
                      setBatchType(opt);
                      handleGeneratePayroll();
                    }}
                  >
                    {opt}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold">${formatMoney(totalPayroll)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Payroll</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-700">${formatMoney(totalBase)}</p>
                <p className="text-xs text-gray-500 mt-1">Base Salaries</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-700">${formatMoney(totalOt)}</p>
                <p className="text-xs text-gray-500 mt-1">OT Payments</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">${formatMoney(totalDeductions)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Deductions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {isSelfPayslipView && currentEmployee && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">${formatMoney(currentEmployee.baseSalary)}</span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Base Salary</p>
              <p className="text-[11px] text-gray-500 truncate">Per month</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-600">
                  ${formatMoney(calculateOTRate(currentEmployee.baseSalary))}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">OT Rate (1.5x)</p>
              <p className="text-[11px] text-gray-500 truncate">Per hour</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
                <span className="text-2xl font-bold text-purple-600">
                  ${formatMoney(payrollRecords[0]?.totalPay ?? 0)}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-700 truncate">Last Payment</p>
              <p className="text-[11px] text-gray-500 truncate">
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
                  <TableHead>Author</TableHead>
                  <TableHead>Modifier</TableHead>
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
                  // Display names come from the backend now (user→employee
                  // resolved on the DTO). The legacy local lookup against
                  // `employees` failed for non-admin actors because
                  // batch.uploadedBy / approvedBy is a USER UUID, not an
                  // employee id — `employees.find()` couldn't match it.
                  const uploaderName = batch.uploadedByName
                    ?? employees.find(e => e.id === batch.uploadedBy || (e as Employee).apiId === batch.uploadedBy)?.name
                    ?? '—';
                  const approverName = batch.approvedByName
                    ?? (batch.approvedBy ? employees.find(e => e.id === batch.approvedBy || (e as Employee).apiId === batch.approvedBy)?.name : undefined)
                    ?? null;
                  const completerName = batch.completedByName
                    ?? (batch.completedBy ? employees.find(e => e.id === batch.completedBy || (e as Employee).apiId === batch.completedBy)?.name : undefined)
                    ?? null;
                  const rejecterName = batch.rejectedByName
                    ?? (batch.rejectedBy ? employees.find(e => e.id === batch.rejectedBy || (e as Employee).apiId === batch.rejectedBy)?.name : undefined)
                    ?? null;
                  const rowTone =
                    batch.status === 'pending'  ? 'bg-yellow-50/40' :
                    batch.status === 'rejected' ? 'bg-red-50/40'    : '';
                  return (
                    <TableRow key={batch.id} className={rowTone}>
                      <TableCell><StatusBadge status={batch.status} /></TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{batch.monthYear}</p>
                        <p className="text-[11px] text-gray-500">{formatDate(batch.date)} · {batch.type}</p>
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
                        ${formatMoney(batch.netSalary)}
                      </TableCell>
                      <TableCell className="text-[11px] text-gray-600 leading-snug">
                        <p>📥 {uploaderName} · {format(new Date(batch.uploadedAt), 'MMM dd HH:mm')}</p>
                        {approverName && batch.approvedAt && (
                          <p>✅ {approverName} · {format(new Date(batch.approvedAt), 'MMM dd HH:mm')}</p>
                        )}
                        {completerName && batch.completedAt && (
                          <p>💰 {completerName} · {format(new Date(batch.completedAt), 'MMM dd HH:mm')}</p>
                        )}
                        {rejecterName && batch.rejectedAt && (
                          <p className="text-red-700">❌ {rejecterName} · {format(new Date(batch.rejectedAt), 'MMM dd HH:mm')}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <AuditCell
                          name={(batch as any).createdByName ?? uploaderName}
                          at={(batch as any).createdAt ?? batch.uploadedAt}
                        />
                      </TableCell>
                      <TableCell>
                        <AuditCell
                          name={(batch as any).updatedByName}
                          at={(batch as any).updatedAt}
                        />
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

      {isSelfPayslipView && !selectedBatch && (
        <Card>
          <CardHeader>
            <CardTitle>My Payroll Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month/Year</TableHead>
                  <TableHead>Subject</TableHead>
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
                    <TableCell className="text-sm">
                      {(record as { batchSubject?: string }).batchSubject ?? <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{record.payrollAccount || '-'}</TableCell>
                    <TableCell>{record.currency}</TableCell>
                    <TableCell className="font-semibold">${formatMoney(record.totalPay)}</TableCell>
                    <TableCell className="text-green-600">${formatMoney(record.totalEarnings)}</TableCell>
                    <TableCell className="text-red-600">${formatMoney(record.deductions)}</TableCell>
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
                <p className="text-2xl font-bold">${formatMoney(selectedBatch.netSalary)}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Earnings</p>
                <p className="text-2xl font-bold">${formatMoney(selectedBatch.totalEarnings)}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Deductions</p>
                <p className="text-2xl font-bold">${formatMoney(selectedBatch.deductions)}</p>
              </div>
            </div>

            {(() => {
              const detailRows = USE_MOCKS ? payrollRecords : batchItems;
              const allIds = detailRows.map(r => r.id);
              // Mail / SMS / Bank Transfer dispatch is only meaningful once
              // a batch is approved. For pending / rejected / done batches we
              // hide the toolbar, selection checkbox, and the three Yes/No
              // columns — the action wouldn't fire anyway and the columns
              // would just confuse admins reviewing a draft.
              const dispatchEnabled = selectedBatch?.status === 'approved';
              const allChecked = allIds.length > 0 && allIds.every(id => selectedRowIds.has(id));
              const someChecked = !allChecked && allIds.some(id => selectedRowIds.has(id));
              const toggleAll = () => {
                if (allChecked) setSelectedRowIds(new Set());
                else setSelectedRowIds(new Set(allIds));
              };
              const toggleOne = (id: string) => {
                const next = new Set(selectedRowIds);
                if (next.has(id)) next.delete(id); else next.add(id);
                setSelectedRowIds(next);
              };

              // Resolve each row to its employee once.
              const empByRowId = new Map<string, Employee | undefined>();
              detailRows.forEach(r => {
                empByRowId.set(r.id, employees.find(
                  e => e.id === r.employeeId || (e as Employee).apiId === r.employeeId,
                ));
              });

              // Yes = already dispatched on that channel. Yes rows are
              // excluded from any subsequent bulk send.
              const sentByChannel = { mail: sentMail, sms: sentSms, bank: sentBank } as const;
              const setSentByChannel = { mail: setSentMail, sms: setSentSms, bank: setSentBank } as const;

              const dispatch = async (channel: 'mail' | 'sms' | 'bank') => {
                if (selectedRowIds.size === 0) {
                  toast.warning('Tick at least one row first.');
                  return;
                }
                const labels = { mail: 'email', sms: 'SMS', bank: 'bank transfer' } as const;
                const sentSet = sentByChannel[channel];
                // Skip rows already marked Yes for this channel — never
                // double-send.
                const targets = Array.from(selectedRowIds).filter(id => !sentSet.has(id));
                const alreadySent = selectedRowIds.size - targets.length;
                if (targets.length === 0) {
                  toast.warning(`All ${selectedRowIds.size} selected row${selectedRowIds.size === 1 ? ' is' : 's are'} already sent by ${labels[channel]}.`);
                  return;
                }

                // Mock mode keeps the legacy in-memory behavior — no
                // backend to call against. Live mode persists to the
                // database via POST /payroll/batches/{id}/dispatch so a
                // page reload still shows the green ticks.
                if (USE_MOCKS || !selectedBatch) {
                  setSentByChannel[channel](prev => {
                    const next = new Set(prev);
                    targets.forEach(id => next.add(id));
                    return next;
                  });
                  const note = alreadySent > 0
                    ? ` — ${alreadySent} already sent earlier and skipped.`
                    : '';
                  toast.success(
                    `Queued ${targets.length} payslip${targets.length === 1 ? '' : 's'} for ${labels[channel]}${note}`,
                    { duration: 6000 },
                  );
                  return;
                }

                try {
                  const res = await payrollApi.dispatchBatchItems(selectedBatch.id, channel, targets);
                  // Reflect the server-confirmed dispatched ids in local
                  // state. We mirror only `targets` here — the server
                  // re-applies its own idempotency check, but we already
                  // filtered out already-sent rows above, so targets and
                  // res.dispatched should match in normal flows.
                  setSentByChannel[channel](prev => {
                    const next = new Set(prev);
                    targets.forEach(id => next.add(id));
                    return next;
                  });
                  const note = alreadySent > 0
                    ? ` — ${alreadySent} already sent earlier and skipped.`
                    : '';
                  toast.success(
                    `Queued ${res.dispatched} payslip${res.dispatched === 1 ? '' : 's'} for ${labels[channel]}${note}`,
                    { duration: 6000 },
                  );
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : `Failed to dispatch ${labels[channel]}`);
                }
              };

              // Visual cue for the per-channel sent state. Filled green
              // tick = already dispatched (and locked out of subsequent
              // bulk sends by the dispatch filter at L2238). Hollow gray
              // circle = not sent yet.
              const yesNo = (yes: boolean) =>
                yes
                  ? <CheckCircle className="h-5 w-5 text-green-600 inline" aria-label="Sent" />
                  : <Circle className="h-5 w-5 text-gray-300 inline" aria-label="Not sent" />;

              return (
                <>
                  {!dispatchEnabled && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        Payslip delivery (Mail / SMS / Bank Transfer) becomes available
                        once this batch is <strong>approved</strong>. Current status:&nbsp;
                        <strong>{selectedBatch?.status ?? 'pending'}</strong>.
                      </span>
                    </div>
                  )}
                  {dispatchEnabled && (
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                    <span className="text-gray-500">
                      {selectedRowIds.size > 0
                        ? `${selectedRowIds.size} selected`
                        : 'Tick rows then choose a delivery channel:'}
                    </span>
                    {(() => {
                      // Count how many selected rows would actually fire on
                      // each channel (selected and not yet sent).
                      const eligibleCount = (sent: Set<string>) =>
                        Array.from(selectedRowIds).filter(id => !sent.has(id)).length;
                      const m = eligibleCount(sentMail);
                      const s = eligibleCount(sentSms);
                      const b = eligibleCount(sentBank);
                      return (
                        <>
                          <Button size="sm" variant="outline" disabled={m === 0} onClick={() => dispatch('mail')}>
                            <Mail className="h-3.5 w-3.5 mr-1.5" />
                            Send by Mail{selectedRowIds.size > 0 ? ` (${m})` : ''}
                          </Button>
                          <Button size="sm" variant="outline" disabled={s === 0} onClick={() => dispatch('sms')}>
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                            Send by SMS{selectedRowIds.size > 0 ? ` (${s})` : ''}
                          </Button>
                          <Button size="sm" variant="outline" disabled={b === 0} onClick={() => dispatch('bank')}>
                            <Landmark className="h-3.5 w-3.5 mr-1.5" />
                            Push Bank Transfer{selectedRowIds.size > 0 ? ` (${b})` : ''}
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {dispatchEnabled && (
                          <TableHead className="w-10 text-center">
                            <Checkbox
                              checked={allChecked || (someChecked ? 'indeterminate' : false)}
                              onCheckedChange={toggleAll}
                              disabled={allIds.length === 0}
                              aria-label="Select all rows"
                            />
                          </TableHead>
                        )}
                        <TableHead>Employee</TableHead>
                        <TableHead>Position / Department</TableHead>
                        <TableHead>Payroll Account</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Net Salary</TableHead>
                        <TableHead>Total Earnings</TableHead>
                        <TableHead>Deductions</TableHead>
                        {dispatchEnabled && <TableHead className="text-center">Mail</TableHead>}
                        {dispatchEnabled && <TableHead className="text-center">SMS</TableHead>}
                        {dispatchEnabled && <TableHead className="text-center">Bank Transfer</TableHead>}
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchItemsLoading ? (
                        <TableRow>
                          <TableCell colSpan={dispatchEnabled ? 12 : 8} className="text-center py-8 text-gray-400">
                            Loading payroll items…
                          </TableCell>
                        </TableRow>
                      ) : detailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={dispatchEnabled ? 12 : 8} className="text-center py-8 text-gray-400">
                            No items in this batch
                          </TableCell>
                        </TableRow>
                      ) : detailRows.map((record) => {
                    const employee = empByRowId.get(record.id);
                    const dept = deptName(employee?.department);
                    const checked = selectedRowIds.has(record.id);
                    return (
                    <TableRow key={record.id} className={dispatchEnabled && checked ? 'bg-blue-50/40' : undefined}>
                      {dispatchEnabled && (
                        <TableCell className="text-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(record.id)}
                            aria-label={`Select ${employee?.name ?? record.employeeId}`}
                          />
                        </TableCell>
                      )}
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
                      <TableCell className="font-semibold">${formatMoney(record.totalPay)}</TableCell>
                      <TableCell className="text-green-600">${formatMoney(record.totalEarnings)}</TableCell>
                      <TableCell className="text-red-600">${formatMoney(record.deductions)}</TableCell>
                      {dispatchEnabled && <TableCell className="text-center">{yesNo(sentMail.has(record.id))}</TableCell>}
                      {dispatchEnabled && <TableCell className="text-center">{yesNo(sentSms.has(record.id))}</TableCell>}
                      {dispatchEnabled && <TableCell className="text-center">{yesNo(sentBank.has(record.id))}</TableCell>}
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
                    <p><span className="text-gray-500">Net Salary:</span> <strong>${formatMoney(approveTarget.netSalary)}</strong></p>
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
  /** Owning batch's subject — set in adaptBackendItem; absent on legacy
   *  mock rows. The PayslipBody header prefers this over the synthesised
   *  "Year YYYY Month MM Salary" fallback. */
  batchSubject?: string;
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
    // V43: the canonical earning fields (Basic / Position / Evaluation)
    // no longer have payroll_categories rows — they're standing Employee
    // columns. The generator still writes them under fixed keys in the
    // extras map. We surface those first with hardcoded labels, then
    // walk the remaining configured categories (Bonus, OT, Meal, …).
    //
    // For a "1st Salary" batch the generator emits ONLY a first_salary
    // line at 50% of (basic + position + evaluation); we detect that
    // shape and render just that one item instead of the three.
    const fsVal = Number(payslip.extras['first_salary'] ?? 0);
    const isFirstSalary = fsVal !== 0;
    if (isFirstSalary) {
      earnings.push({ label: '1st Salary', amount: fsVal });
    } else {
      const basicVal = Number(payslip.extras['basic'] ?? payslip.baseSalary ?? 0);
      if (basicVal !== 0) earnings.push({ label: 'Basic Salary',         amount: basicVal });
      const posVal   = Number(payslip.extras['position'] ?? 0);
      if (posVal   !== 0) earnings.push({ label: 'Position Allowance',   amount: posVal });
      const evalVal  = Number(payslip.extras['evaluation'] ?? 0);
      if (evalVal  !== 0) earnings.push({ label: 'Evaluation Allowance', amount: evalVal });
    }
    const seen = new Set(['basic', 'position', 'evaluation', 'first_salary']);
    earningCategories.forEach(c => {
      if (seen.has(c.code.toLowerCase())) return;
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
          {/* Prefer the batch subject (e.g. "1st Salary of May") so the
              dialog header matches the listing. Fall back to the
              synthesised year/month label for legacy rows that pre-date
              the batchSubject field. */}
          {payslip.batchSubject
            ?? `Year ${format(new Date(payslip.month + '-01'), 'yyyy')} Month ${format(new Date(payslip.month + '-01'), 'MM')} Salary`}
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
              <span className="font-medium">${formatMoney(line.amount)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total Earnings</span>
            <span>${formatMoney(payslip.totalEarnings)}</span>
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
              <span className="font-medium">${formatMoney(line.amount)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total Deductions</span>
            <span>${formatMoney(payslip.deductions)}</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold">Net Salary</span>
          <span className="text-2xl font-bold text-blue-600">${formatMoney(payslip.totalPay)}</span>
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
        No other active users with Payroll access available.
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
