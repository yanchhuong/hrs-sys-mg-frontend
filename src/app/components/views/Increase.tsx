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
import { Checkbox } from '../ui/checkbox';
import { mockIncreases } from '../../data/timeworkData';
import { useAuth } from '../../context/AuthContext';
import { mockEmployees } from '../../data/mockData';
import { SalaryIncrease } from '../../types/timework';
import { Employee } from '../../types/hrms';
import * as increasesApi from '../../api/increases';
import * as employeesApi from '../../api/employees';
import * as categoriesApi from '../../api/payrollCategories';
import { formatMoney } from '../../utils/format';
import { USE_MOCKS } from '../../api/client';
import { TrendingUp, Plus, Eye, User as UserIcon, Filter, Search, X } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
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
  // Legacy rows pre-V41 only carry isPercentage; derive unit from it so
  // the Amount/Unit columns render consistently across old + new rows.
  const unit = r.unit ?? (r.isPercentage ? 'percentage' : 'amount');
  return {
    id: r.id,
    employeeId: r.employeeId,
    type: r.type,
    amount: r.amount,
    isPercentage: r.isPercentage ?? false,
    unit,
    effectiveDate: r.effectiveDate,
    recurrence: r.recurrence ?? 'once',
    effectiveUntil: r.effectiveUntil ?? undefined,
    reason: r.reason ?? '',
    approvedBy: r.approvedBy ?? '',
    approvedAt: r.createdAt ?? '',
  };
}

const UNIT_LABEL: Record<'amount' | 'percentage' | 'day', string> = {
  amount:     'Fixed Amount',
  percentage: 'Percentage',
  day:        'Day(s)',
};

function formatIncreaseAmount(inc: SalaryIncrease, locale = false): string {
  const unit = inc.unit ?? (inc.isPercentage ? 'percentage' : 'amount');
  // Currency uses formatMoney (#,###.00); day / percentage keep a plain
  // number since they're not amounts (e.g. "7.5 days", "10%"). The
  // `locale` flag is retained for callers that still pass it but the
  // formatting is now driven by the unit.
  void locale;
  if (unit === 'day')        return `${inc.amount} days`;
  if (unit === 'percentage') return `${inc.amount}%`;
  return `$${formatMoney(inc.amount)}`;
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
  const { formatDate } = useDateFormat();
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
  // Header filters — Type picker + free-text search, mirrors the
  // Salary Deduction page so HR uses the same shape on both screens.
  // Search matches against the employee's name / empNo / position and
  // the increase reason; case-insensitive.
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create-dialog form state
  const [newEmployeeId, setNewEmployeeId] = useState<string>('');
  // When unit is 'percentage' or 'day' the increase is a formula, not a
  // flat dollar amount — so the same rule (e.g. 7.5 days seniority) applies
  // to multiple employees but resolves to a different cash value per person.
  // The dialog flips the Employee input from a single-picker to a checkbox
  // list and creates one salary_increase row per selected id on submit.
  const [multiEmployeeIds, setMultiEmployeeIds] = useState<string[]>([]);
  const [employeePickerSearch, setEmployeePickerSearch] = useState<string>('');
  const [newType, setNewType] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  /** "amount" (dollars), "percentage" (% of base), or "day" (day count).
   *  Drives the unit dropdown and the Amount/Days label flip. */
  const [newUnit, setNewUnit] = useState<'amount' | 'percentage' | 'day'>('amount');
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
    setMultiEmployeeIds([]);
    setEmployeePickerSearch('');
    setNewType('');
    setNewAmount('');
    setNewUnit('amount');
    setNewEffectiveDate(format(new Date(), 'yyyy-MM-dd'));
    setNewRecurrence('once');
    setNewEffectiveUntil('');
    setNewReason('');
  };

  // Multi-target mode: percentage / day-unit increases are formulas, so we
  // let the user fan the rule out across many employees in one submit.
  const isMultiTargetMode = newUnit === 'percentage' || newUnit === 'day';

  /** When the user picks a Type, auto-default the unit + amount from the
   *  category's value_type so day-flavoured categories (seniority_indemnity)
   *  arrive pre-filled with their day count. The user can still override. */
  const handleTypeChange = (code: string) => {
    setNewType(code);
    const cat = earningCategories.find((c) => c.code === code);
    if (!cat) return;
    if (cat.valueType === 'day') {
      setNewUnit('day');
      if (cat.defaultAmount > 0) setNewAmount(String(cat.defaultAmount));
    } else if (cat.valueType === 'percentage') {
      setNewUnit('percentage');
    } else {
      setNewUnit('amount');
    }
  };

  const handleAddIncrease = async () => {
    // In multi-target mode (% / day) we ignore the single-picker value and
    // require at least one checked employee; otherwise fall back to the
    // single-picker as before.
    const targetIds = isMultiTargetMode
      ? multiEmployeeIds
      : (newEmployeeId ? [newEmployeeId] : []);
    if (targetIds.length === 0) {
      toast.error(isMultiTargetMode
        ? 'Please select at least one employee'
        : 'Please select an employee');
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
      for (const eid of targetIds) {
        const newRec: SalaryIncrease = {
          id: `inc_${Date.now()}_${eid}`,
          employeeId: eid,
          type: newType,
          amount: amt,
          isPercentage: newUnit === 'percentage',
          unit: newUnit,
          effectiveDate: newEffectiveDate,
          recurrence: newRecurrence,
          effectiveUntil: newRecurrence === 'monthly' && newEffectiveUntil ? newEffectiveUntil : undefined,
          reason: newReason.trim(),
          approvedBy: 'system',
          approvedAt: new Date().toISOString(),
        };
        mockIncreases.push(newRec);
      }
      setIncreases([...mockIncreases]);
      toast.success(targetIds.length === 1
        ? 'Salary increase added successfully'
        : `${targetIds.length} salary increases added`);
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
      // Sequential POSTs — keeps backend write order deterministic and
      // surfaces a per-row failure (e.g. one employee fails a server-side
      // rule) without aborting the whole batch.
      const results = await Promise.allSettled(
        targetIds.map(eid => increasesApi.create({
          employeeId: eid,
          type: newType,
          amount: amt,
          isPercentage: newUnit === 'percentage',
          unit: newUnit,
          effectiveDate: newEffectiveDate,
          recurrence: newRecurrence,
          effectiveUntil: newRecurrence === 'monthly' && newEffectiveUntil ? newEffectiveUntil : null,
          reason: newReason.trim(),
        })),
      );
      const ok = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(ok === 1
          ? 'Salary increase added successfully'
          : `${ok} salary increases added`);
      } else {
        toast.error(`${failed} of ${results.length} failed — ${ok} added`);
      }
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
  if (typeFilter !== 'all') {
    filteredIncreases = filteredIncreases.filter(inc => inc.type === typeFilter);
  }
  // Free-text search matches against the employee (name / empNo /
  // position) and the increase reason. Looked up via the employees
  // list so a stale `inc.employeeId` doesn't drop the row.
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredIncreases = filteredIncreases.filter(inc => {
      const emp = employees.find(
        e => e.id === inc.employeeId || (e as { apiId?: string }).apiId === inc.employeeId,
      );
      const hay = [
        emp?.name, emp?.id, emp?.position, (emp as { khmerName?: string } | undefined)?.khmerName,
        inc.reason,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  const [categories, setCategories] = useState<PayrollCategory[]>(() => loadPayrollCategories());
  // Codes hidden from the Salary Increase Type dropdown. Position and
  // Evaluation are now standing fields on the Employee record (V42), not
  // raises — putting them here would double-count on the payslip. Basic
  // is excluded the same way: it represents the employee's base salary,
  // not an increase line.
  const HIDDEN_INCREASE_CODES = new Set(['position', 'evaluation']);
  const earningCategories = useMemo(
    () =>
      categories
        .filter((c) => c.kind === 'earning' && c.enabled
          && !HIDDEN_INCREASE_CODES.has(c.code.toLowerCase()))
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
  }, [dateFilter, typeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.increase.title')}</h1>
          <p className="text-gray-500">{t('page.increase.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee or reason…"
              className="h-9 pl-8 pr-7 border rounded-md text-sm bg-white w-56"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 px-2 border rounded-md text-sm bg-white"
            >
              <option value="all">All Types</option>
              {earningCategories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            {(typeFilter !== 'all' || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTypeFilter('all'); setSearchQuery(''); }}
                className="h-9 px-2"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
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
              {isMultiTargetMode ? (
                <div className="space-y-2">
                  <Label>
                    Apply to employees
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({multiEmployeeIds.length} selected)
                    </span>
                  </Label>
                  <Input
                    placeholder="Search by name, ID, or position…"
                    value={employeePickerSearch}
                    onChange={(e) => setEmployeePickerSearch(e.target.value)}
                    className="h-8"
                  />
                  {(() => {
                    const active = employees.filter(e => e.status === 'active');
                    const q = employeePickerSearch.trim().toLowerCase();
                    const filtered = q
                      ? active.filter(e => `${e.name} ${e.id} ${e.position ?? ''} ${e.khmerName ?? ''}`.toLowerCase().includes(q))
                      : active;
                    const allVisibleIds = filtered.map(e => (e as { apiId?: string }).apiId ?? e.id);
                    const allChecked = filtered.length > 0
                      && allVisibleIds.every(id => multiEmployeeIds.includes(id));
                    return (
                      <div className="border rounded-md max-h-56 overflow-y-auto">
                        <label className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 cursor-pointer sticky top-0">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(c) => {
                              if (c) {
                                // Union of currently selected + all visible matches.
                                const next = new Set(multiEmployeeIds);
                                allVisibleIds.forEach(id => next.add(id));
                                setMultiEmployeeIds(Array.from(next));
                              } else {
                                // Remove only the currently visible ids — a search
                                // term shouldn't wipe out non-matching selections.
                                setMultiEmployeeIds(multiEmployeeIds.filter(id => !allVisibleIds.includes(id)));
                              }
                            }}
                          />
                          <span className="text-sm font-medium">Select all ({filtered.length})</span>
                        </label>
                        {filtered.length === 0 && (
                          <div className="px-3 py-4 text-sm text-gray-500 text-center">No matches</div>
                        )}
                        {filtered.map(emp => {
                          const val = (emp as { apiId?: string }).apiId ?? emp.id;
                          const checked = multiEmployeeIds.includes(val);
                          return (
                            <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  if (c) setMultiEmployeeIds([...multiEmployeeIds, val]);
                                  else   setMultiEmployeeIds(multiEmployeeIds.filter(id => id !== val));
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{emp.name}</div>
                                <div className="text-xs text-gray-500 truncate">
                                  {emp.id}{emp.position ? ` · ${emp.position}` : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-gray-500">
                    {newUnit === 'percentage'
                      ? 'A percentage rule applies to each employee\'s own base salary — the dollar value differs per person.'
                      : 'A day-based rule (e.g. seniority indemnity) is computed from each employee\'s daily wage on payroll.'}
                  </p>
                </div>
              ) : (
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
              )}
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={newType}
                  onChange={(e) => handleTypeChange(e.target.value)}
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
                  <Label>{newUnit === 'day' ? 'Days' : 'Amount'}</Label>
                  <Input
                    type="number"
                    step={newUnit === 'day' ? '0.5' : '0.01'}
                    placeholder={newUnit === 'day' ? '7.5' : '500'}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as 'amount' | 'percentage' | 'day')}
                  >
                    <option value="amount">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="day">Day(s)</option>
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

      {/* One summary card per enabled Earning category from Payroll
          Categories settings. Layout mirrors the Attendance page's
          summary strip — compact p-4 body, icon-left + big number right,
          label below. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {earningCategories.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-6 text-center text-sm text-gray-500">
              No earning categories configured. Add one under{' '}
              <strong>Settings → Payroll Categories</strong> to start
              tracking increases here.
            </CardContent>
          </Card>
        )}
        {earningCategories.map((cat) => {
          const rows  = filteredIncreases.filter((i) => i.type === cat.code);
          const count = rows.length;
          // Flat-amount rows contribute to the dollar total; percentage /
          // day-formula rows can't be summed in one currency, so we show
          // their count below the total instead.
          const total = rows
            .filter((i) => (i.unit ?? (i.isPercentage ? 'percentage' : 'amount')) === 'amount')
            .reduce((sum, i) => sum + i.amount, 0);
          return (
            <Card key={cat.id} className="border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="text-2xl font-bold text-green-600">{count}</span>
                </div>
                <p className="text-xs font-medium text-gray-700 truncate" title={cat.label}>{cat.label}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {total > 0 ? `$${formatMoney(total)} total` : 'No entries yet'}
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
                <TableHead>Unit</TableHead>
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
                    <TableCell className="text-gray-700">
                      {UNIT_LABEL[increase.unit ?? (increase.isPercentage ? 'percentage' : 'amount')]}
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      +{formatIncreaseAmount(increase)}
                    </TableCell>
                    <TableCell>{formatDate(increase.effectiveDate)}</TableCell>
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
                  <DetailRow label="Unit">
                    {UNIT_LABEL[detailsTarget.unit ?? (detailsTarget.isPercentage ? 'percentage' : 'amount')]}
                  </DetailRow>
                  <DetailRow label="Amount">
                    <span className="font-semibold text-green-700">
                      +{formatIncreaseAmount(detailsTarget, true)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Effective Date">
                    {formatDate(detailsTarget.effectiveDate)}
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
