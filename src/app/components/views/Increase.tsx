import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AuditCell } from '../common/AuditCell';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
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
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { SearchablePicker } from '../common/SearchablePicker';
import { mockIncreases } from '../../data/timeworkData';
import { useAuth } from '../../context/AuthContext';
import { mockEmployees } from '../../data/mockData';
import { SalaryIncrease } from '../../types/timework';
import { Employee } from '../../types/hrms';
import * as increasesApi from '../../api/increases';
import * as employeesApi from '../../api/employees';
import * as categoriesApi from '../../api/payrollCategories';
import { USE_MOCKS } from '../../api/client';
import { TrendingUp, Plus, Eye, User as UserIcon } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';
import { loadPayrollCategories } from '../../utils/payrollCategories';
import { PayrollCategory } from '../../types/settings';

// Adapts a backend Employee to the front-end Employee shape used by this view.
// Mirrors the pattern from Employees.tsx / Exception.tsx — `id` holds the
// human-readable empNo and the backend UUID is kept on `apiId`.
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

// Adapts a backend SalaryIncrease to the front-end SalaryIncrease shape.
// We keep the backend UUID untouched on `employeeId`; render-side lookups
// match on either `.id` (empNo) or `.apiId` (UUID), so we don't depend on the
// employees list having loaded before increases.
function adaptApiIncrease(r: increasesApi.SalaryIncrease): SalaryIncrease {
  return {
    id: r.id,
    employeeId: r.employeeId,
    type: r.type,
    amount: r.amount,
    isPercentage: r.isPercentage ?? false,
    effectiveDate: r.effectiveDate,
    recurrence: r.recurrence ?? 'once',
    effectiveUntil: r.effectiveUntil ?? undefined,
    reason: r.reason ?? '',
    approvedBy: r.approvedBy ?? '',
    approvedAt: r.createdAt ?? '',
  };
}

const CATEGORY_COLORS = [
  'bg-green-100 text-green-800 hover:bg-green-100',
  'bg-blue-100 text-blue-800 hover:bg-blue-100',
  'bg-purple-100 text-purple-800 hover:bg-purple-100',
  'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  'bg-amber-100 text-amber-800 hover:bg-amber-100',
  'bg-pink-100 text-pink-800 hover:bg-pink-100',
  'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  'bg-orange-100 text-orange-800 hover:bg-orange-100',
];

export function Increase() {
  const { t } = useI18n();
  // Permission gates per the matrix in Settings → User Management → Permissions.
  // A role with V-only on 'increase' will hide the Add button and per-row
  // Edit / Delete actions; the page still renders the read-only table.
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('increase');
  const canEdit = canUpdate('increase');
  const canRemove = canDelete('increase');
  void canEdit; void canRemove; // future per-row mutations gate here
  const [increases, setIncreases] = useState<SalaryIncrease[]>(USE_MOCKS ? mockIncreases : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [, setLoading] = useState<boolean>(!USE_MOCKS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<SalaryIncrease | null>(null);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  // Create-dialog form state
  const [newEmployeeId, setNewEmployeeId] = useState<string>('');
  const [newType, setNewType] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newIsPercentage, setNewIsPercentage] = useState<boolean>(false);
  const [newEffectiveDate, setNewEffectiveDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  // Recurrence: 'once' = single payroll cycle (default; permanent base
  // salary bump for type=basic). 'monthly' = repeats every cycle through
  // newEffectiveUntil (blank = open-ended).
  const [newRecurrence, setNewRecurrence] = useState<'once' | 'monthly'>('once');
  const [newEffectiveUntil, setNewEffectiveUntil] = useState<string>('');
  const [newReason, setNewReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const loadIncreases = async () => {
    if (USE_MOCKS) {
      setIncreases([...mockIncreases]);
      return;
    }
    try {
      const res = await increasesApi.list({ size: 500 });
      setIncreases(res.data.map(adaptApiIncrease));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load salary increases');
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadIncreases(), loadEmployees()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setNewEmployeeId('');
    setNewType('');
    setNewAmount('');
    setNewIsPercentage(false);
    setNewEffectiveDate(format(new Date(), 'yyyy-MM-dd'));
    setNewRecurrence('once');
    setNewEffectiveUntil('');
    setNewReason('');
  };

  const handleAddIncrease = async () => {
    if (!newEmployeeId) {
      toast.error('Please select an employee');
      return;
    }
    if (!newType) {
      toast.error('Please select a type');
      return;
    }
    const amt = parseFloat(newAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!newEffectiveDate) {
      toast.error('Please select an effective date');
      return;
    }
    if (!newReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    if (USE_MOCKS) {
      const newRec: SalaryIncrease = {
        id: `inc_${Date.now()}`,
        employeeId: newEmployeeId,
        type: newType,
        amount: amt,
        isPercentage: newIsPercentage,
        effectiveDate: newEffectiveDate,
        recurrence: newRecurrence,
        effectiveUntil: newRecurrence === 'monthly' && newEffectiveUntil ? newEffectiveUntil : undefined,
        reason: newReason.trim(),
        approvedBy: 'system',
        approvedAt: new Date().toISOString(),
      };
      mockIncreases.push(newRec);
      setIncreases([...mockIncreases]);
      toast.success('Salary increase added successfully');
      resetForm();
      setDialogOpen(false);
      return;
    }

    // Validation: monthly with an end date must end on/after start.
    if (newRecurrence === 'monthly' && newEffectiveUntil && newEffectiveUntil < newEffectiveDate) {
      toast.error('Effective Until must be on or after Effective Date');
      return;
    }

    setSubmitting(true);
    try {
      // The chosen value is the employee's apiId (UUID) when available,
      // falling back to id (empNo) for safety.
      await increasesApi.create({
        employeeId: newEmployeeId,
        type: newType,
        amount: amt,
        isPercentage: newIsPercentage,
        effectiveDate: newEffectiveDate,
        recurrence: newRecurrence,
        // Only meaningful for monthly; once-rows ignore it server-side.
        effectiveUntil: newRecurrence === 'monthly' && newEffectiveUntil ? newEffectiveUntil : null,
        reason: newReason.trim(),
      });
      toast.success('Salary increase added successfully');
      resetForm();
      setDialogOpen(false);
      await loadIncreases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add salary increase');
    } finally {
      setSubmitting(false);
    }
  };

  let filteredIncreases = increases;

  // Apply date filter based on effectiveDate
  if (dateFilter.start || dateFilter.end) {
    filteredIncreases = filteredIncreases.filter(inc => {
      const incDate = parseISO(inc.effectiveDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(incDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return incDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return incDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  const [categories, setCategories] = useState<PayrollCategory[]>(() => loadPayrollCategories());
  const earningCategories = useMemo(
    () =>
      categories
        .filter((c) => c.kind === 'earning' && c.enabled)
        .sort((a, b) => a.order - b.order),
    [categories],
  );

  // Live mode: pull the tenant's actual payroll categories from the
  // backend so the Type dropdown reflects what HR configured under
  // Settings → Payroll Categories. Falling back to localStorage (mock
  // seed) leaves the dropdown empty for tenants that never visited that
  // settings page. Mock mode continues to use the localStorage seed.
  useEffect(() => {
    if (USE_MOCKS) {
      const refresh = () => setCategories(loadPayrollCategories());
      window.addEventListener('focus', refresh);
      return () => window.removeEventListener('focus', refresh);
    }
    let cancelled = false;
    const reload = async () => {
      try {
        const rows = await categoriesApi.list();
        if (!cancelled) setCategories(rows as unknown as PayrollCategory[]);
      } catch {
        // Fall through silently — the dropdown just shows whatever is
        // already in state. The toast on the page handles user-visible
        // load errors elsewhere.
      }
    };
    void reload();
    window.addEventListener('focus', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', reload);
    };
  }, []);

  const categoryLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    earningCategories.forEach((c) => m.set(c.code, c.label));
    return m;
  }, [earningCategories]);

  const categoryColorMap = useMemo(() => {
    const m = new Map<string, string>();
    earningCategories.forEach((c, idx) => m.set(c.code, CATEGORY_COLORS[idx % CATEGORY_COLORS.length]));
    return m;
  }, [earningCategories]);

  const getTypeColor = (type: string) =>
    categoryColorMap.get(type) ?? 'bg-gray-100 text-gray-800 hover:bg-gray-100';

  const getTypeLabel = (type: string) => categoryLabelMap.get(type) ?? type;

  const increasePagination = usePagination(filteredIncreases, 10);

  useEffect(() => {
    increasePagination.resetPage();
  }, [dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.increase.title')}</h1>
          <p className="text-gray-500">{t('page.increase.description')}</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          {canAdd && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Increase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Salary Increase</DialogTitle>
              <DialogDescription>Record a raise, bonus, or promotion</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Employee</Label>
                {/* Searchable picker — same UX as Manager/Lead and the
                    Member picker. Supports name / empNo / position search. */}
                <SearchablePicker
                  options={employees
                    .filter(e => e.status === 'active')
                    .map(emp => {
                      const val = (emp as { apiId?: string }).apiId ?? emp.id;
                      return {
                        value: val,
                        label: emp.name,
                        secondary: `${emp.id} · ${emp.position ?? ''}`,
                        searchKey: `${emp.name} ${emp.id} ${emp.position ?? ''} ${emp.khmerName ?? ''}`,
                      };
                    })}
                  value={newEmployeeId}
                  onChange={setNewEmployeeId}
                  placeholder="Select employee…"
                  searchPlaceholder="Search by name, ID, or position…"
                  allowClear={false}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  <option value="">Select type…</option>
                  {earningCategories.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    placeholder="500"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={newIsPercentage ? 'percentage' : 'fixed'}
                    onChange={(e) => setNewIsPercentage(e.target.value === 'percentage')}
                  >
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input
                  type="date"
                  value={newEffectiveDate}
                  onChange={(e) => setNewEffectiveDate(e.target.value)}
                />
              </div>
              {/* Recurrence — drives whether the row affects only one
                  payroll cycle (default; how Basic permanently bumps the
                  base salary) or repeats each month through Effective
                  Until. The payroll template generator includes recurring
                  rows automatically for every month inside the window. */}
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRecurrence('once')}
                    className={`flex-1 px-3 py-2 text-sm border rounded-md transition ${
                      newRecurrence === 'once'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    One-time
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRecurrence('monthly')}
                    className={`flex-1 px-3 py-2 text-sm border rounded-md transition ${
                      newRecurrence === 'monthly'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Repeat Monthly
                  </button>
                </div>
                {newRecurrence === 'once' && (newType === 'basic' || newType === 'salary' || newType === 'base') && (
                  <p className="text-xs text-blue-700">
                    Basic / salary increases permanently bump the employee's base salary. Apply once.
                  </p>
                )}
                {newRecurrence === 'monthly' && (newType === 'basic' || newType === 'salary' || newType === 'base') && (
                  <p className="text-xs text-amber-700">
                    Note: Monthly recurrence on a base-salary type adds the amount each cycle but does not stack into base salary.
                  </p>
                )}
              </div>
              {newRecurrence === 'monthly' && (
                <div className="space-y-2">
                  <Label>
                    Effective Until <span className="text-xs text-gray-500 font-normal">(blank = open-ended)</span>
                  </Label>
                  <Input
                    type="date"
                    value={newEffectiveUntil}
                    min={newEffectiveDate || undefined}
                    onChange={(e) => setNewEffectiveUntil(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>
                  Reason <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  placeholder="Annual performance review, promotion to senior role, etc."
                  rows={3}
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                />
              </div>
              <Button onClick={handleAddIncrease} className="w-full" disabled={submitting}>
                {submitting ? 'Adding…' : 'Add Increase'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {earningCategories.slice(0, 3).map((cat) => {
          const count = filteredIncreases.filter((i) => i.type === cat.code).length;
          const total = filteredIncreases
            .filter((i) => i.type === cat.code)
            .reduce((sum, i) => sum + (i.isPercentage ? 0 : i.amount), 0);
          return (
            <Card key={cat.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">{cat.label}</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-gray-500">
                  {total > 0 ? `$${total.toLocaleString()} total` : 'This year'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary Increase History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Modifier</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {increasePagination.paginatedItems.map((increase) => {
                const employee = employees.find(
                  (e) => e.id === increase.employeeId || (e as { apiId?: string }).apiId === increase.employeeId,
                );
                const approver = employees.find(
                  (e) => e.id === increase.approvedBy || (e as { apiId?: string }).apiId === increase.approvedBy,
                );
                return (
                  <TableRow key={increase.id}>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeColor(increase.type)}>
                        {getTypeLabel(increase.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      +{increase.isPercentage ? `${increase.amount}%` : `$${increase.amount}`}
                    </TableCell>
                    <TableCell>{format(new Date(increase.effectiveDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="max-w-xs truncate">{increase.reason}</TableCell>
                    <TableCell>{approver?.name}</TableCell>
                    <TableCell>
                      <AuditCell
                        name={(increase as any).createdByName}
                        at={(increase as any).createdAt}
                      />
                    </TableCell>
                    <TableCell>
                      <AuditCell
                        name={(increase as any).updatedByName}
                        at={(increase as any).updatedAt}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDetailsTarget(increase)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filteredIncreases.length === 0 && (
            <div className="text-center py-12">
              <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No salary increases recorded</p>
            </div>
          )}
          <Pagination
            currentPage={increasePagination.currentPage}
            totalPages={increasePagination.totalPages}
            onPageChange={increasePagination.goToPage}
            startIndex={increasePagination.startIndex}
            endIndex={increasePagination.endIndex}
            totalItems={increasePagination.totalItems}
          />
        </CardContent>
      </Card>

      {/* View Details */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => !o && setDetailsTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Salary Increase Details
            </DialogTitle>
            <DialogDescription>Read-only record. Create a correction entry if anything here is wrong.</DialogDescription>
          </DialogHeader>
          {detailsTarget && (() => {
            const employee = employees.find(
              (e) => e.id === detailsTarget.employeeId || (e as { apiId?: string }).apiId === detailsTarget.employeeId,
            );
            const approver = employees.find(
              (e) => e.id === detailsTarget.approvedBy || (e as { apiId?: string }).apiId === detailsTarget.approvedBy,
            );
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-md border">
                  <EmployeeCell employee={employee} subtitle={employee?.position} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DetailRow label="Type">
                    <Badge className={getTypeColor(detailsTarget.type)}>{getTypeLabel(detailsTarget.type)}</Badge>
                  </DetailRow>
                  <DetailRow label="Amount">
                    <span className="font-semibold text-green-700">
                      +{detailsTarget.isPercentage ? `${detailsTarget.amount}%` : `$${detailsTarget.amount.toLocaleString()}`}
                    </span>
                  </DetailRow>
                  <DetailRow label="Effective Date">
                    {format(new Date(detailsTarget.effectiveDate), 'MMM dd, yyyy')}
                  </DetailRow>
                  <DetailRow label="Approved At">
                    {detailsTarget.approvedAt
                      ? format(new Date(detailsTarget.approvedAt), 'MMM dd, yyyy HH:mm')
                      : '—'}
                  </DetailRow>
                </div>

                <DetailRow label="Reason" full>
                  <p className="text-sm">{detailsTarget.reason}</p>
                </DetailRow>

                <DetailRow label="Approved By" full>
                  <div className="flex items-center gap-2 text-sm">
                    <UserIcon className="h-3.5 w-3.5 text-gray-400" />
                    <span>{approver?.name ?? detailsTarget.approvedBy}</span>
                    {approver?.email && <span className="text-gray-500 text-xs">· {approver.email}</span>}
                  </div>
                </DetailRow>

                <div className="text-[11px] text-gray-400">Record ID: <code>{detailsTarget.id}</code></div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button onClick={() => setDetailsTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? 'col-span-2' : ''}`}>
      <Label className="text-[11px] uppercase tracking-wide text-gray-500">{label}</Label>
      <div className="text-sm">{children}</div>
    </div>
  );
}
