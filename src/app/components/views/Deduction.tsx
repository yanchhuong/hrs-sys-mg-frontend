import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AuditCell } from '../common/AuditCell';
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
import { Switch } from '../ui/switch';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { EmployeeCell } from '../common/EmployeeCell';
import { SearchablePicker } from '../common/SearchablePicker';
import { mockDeductions } from '../../data/timeworkData';
import { mockEmployees } from '../../data/mockData';
import { SalaryDeduction } from '../../types/timework';
import { Employee } from '../../types/hrms';
import * as deductionsApi from '../../api/deductions';
import * as employeesApi from '../../api/employees';
import { USE_MOCKS } from '../../api/client';
import { Minus, Plus, Pencil, Save, Filter, X, CheckSquare, Search } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoney } from '../../utils/format';
import { loadPayrollCategories } from '../../utils/payrollCategories';
import { PayrollCategory } from '../../types/settings';

// Adapts a backend Employee to the front-end Employee shape (mirrors Employees.tsx /
// Exception.tsx). The user-facing `id` carries the human-readable empNo and the
// backend UUID stays on `apiId` for mutating calls.
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

// Narrows backend status (which is already `active | completed | cancelled`) into
// the front-end union. Older mock rows used `stopped` — map those to `cancelled`.
function narrowDeductionStatus(s: string): SalaryDeduction['status'] {
  if (s === 'active' || s === 'completed' || s === 'cancelled') return s;
  if (s === 'stopped') return 'cancelled';
  return 'active';
}

// Adapts a backend SalaryDeduction into the front-end timework shape rendered
// throughout this view. The backend UUID stays on `employeeId`; render-side
// lookups match either `.id` (empNo) or `.apiId` (UUID).
function adaptApiDeduction(d: deductionsApi.SalaryDeduction): SalaryDeduction {
  return {
    id: d.id,
    employeeId: d.employeeId,
    name: d.name,
    type: d.type,
    amount: d.amount,
    isPercentage: d.isPercentage ?? false,
    isRecurring: d.isRecurring ?? false,
    startDate: d.startDate,
    endDate: d.endDate ?? undefined,
    status: narrowDeductionStatus(d.status),
  };
}

// Rotating palette so newly-added deduction categories still get a distinct badge.
const CATEGORY_COLORS = [
  'bg-red-100 text-red-800 hover:bg-red-100',
  'bg-blue-100 text-blue-800 hover:bg-blue-100',
  'bg-orange-100 text-orange-800 hover:bg-orange-100',
  'bg-purple-100 text-purple-800 hover:bg-purple-100',
  'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  'bg-pink-100 text-pink-800 hover:bg-pink-100',
  'bg-amber-100 text-amber-800 hover:bg-amber-100',
  'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
];

export function Deduction() {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  // Permission gates per the matrix in Settings → User Management → Permissions.
  // A role with V-only on 'deduction' will hide every mutating control here.
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canAdd = canCreate('deduction');
  const canEdit = canUpdate('deduction');
  const canRemove = canDelete('deduction');
  const [deductions, setDeductions] = useState<SalaryDeduction[]>(USE_MOCKS ? mockDeductions : []);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [, setLoading] = useState<boolean>(!USE_MOCKS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalaryDeduction | null>(null);
  const [editForm, setEditForm] = useState<SalaryDeduction | null>(null);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SalaryDeduction['status']>('all');
  // Free-text search — matches the employee (name / empNo / position) and
  // the deduction's own name (e.g. "Health insurance"). Mirrors the
  // search box on the Salary Increase page.
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<SalaryDeduction['status']>('active');

  // Add-deduction form state — moved out of the JSX so it can be submitted via
  // the live API. Defaults to the first employee/category when those load.
  const [newEmployeeId, setNewEmployeeId] = useState<string>('');
  const [newType, setNewType] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  /** "amount" (dollars), "percentage" (% of base), or "day" (day count).
   *  Mirrors the unit picker on Add Salary Increase. Backend persists
   *  the flat boolean via isPercentage; 'day' is currently UI-only
   *  metadata (saved as isPercentage=false on the wire). */
  const [newUnit, setNewUnit] = useState<'amount' | 'percentage' | 'day'>('amount');
  const [newStartDate, setNewStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState<string>('');
  /** Two-state picker on the dialog: 'once' (default — no end date) /
   *  'monthly' (repeats until newEndDate). Maps to isRecurring boolean
   *  on the wire so the backend contract stays unchanged. */
  const [newRecurrence, setNewRecurrence] = useState<'once' | 'monthly'>('once');
  /** When the selected Type is formula-driven (Tax / NSSF / 1st Salary),
   *  HR must opt in via this checkbox before they can enter an Amount.
   *  Unchecked = no manual row is created; the auto-formula stays in
   *  charge. Checked = the entered Amount overrides the formula for the
   *  selected employee while the row is active. */
  const [overrideFormula, setOverrideFormula] = useState<boolean>(false);
  // Multi-target mode: percentage / day-unit deductions are formulas, so
  // we let the user fan the rule out across many employees in one submit.
  const [multiEmployeeIds, setMultiEmployeeIds] = useState<string[]>([]);
  const [employeePickerSearch, setEmployeePickerSearch] = useState<string>('');

  const [categories, setCategories] = useState<PayrollCategory[]>(() => loadPayrollCategories());
  const deductionCategories = useMemo(
    () =>
      categories
        .filter((c) => c.kind === 'deduction' && c.enabled)
        .sort((a, b) => a.order - b.order),
    [categories],
  );

  // Re-sync on focus so changes made in Payroll Categories settings propagate.
  useEffect(() => {
    const refresh = () => setCategories(loadPayrollCategories());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const loadDeductions = async () => {
    if (USE_MOCKS) {
      setDeductions([...mockDeductions]);
      return;
    }
    try {
      // apiJson returns undefined when the tenant has the module
      // disabled (403 ModuleDisabled). Default to empty so the page
      // renders blank instead of crashing on `.map`.
      const res = await deductionsApi.list({ size: 500 });
      setDeductions((res?.data ?? []).map(adaptApiDeduction));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load deductions');
    }
  };

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    try {
      const res = await employeesApi.list({ size: 500 });
      setEmployees((res?.content ?? []).map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadDeductions(), loadEmployees()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default the dialog selectors once the data sources load.
  useEffect(() => {
    if (!newEmployeeId && employees.length > 0) {
      setNewEmployeeId(employees[0].apiId ?? employees[0].id);
    }
  }, [employees, newEmployeeId]);
  useEffect(() => {
    if (!newType && deductionCategories.length > 0) {
      setNewType(deductionCategories[0].code);
    }
  }, [deductionCategories, newType]);

  const categoryLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    deductionCategories.forEach((c) => m.set(c.code, c.label));
    return m;
  }, [deductionCategories]);

  const categoryColorMap = useMemo(() => {
    const m = new Map<string, string>();
    deductionCategories.forEach((c, idx) => m.set(c.code, CATEGORY_COLORS[idx % CATEGORY_COLORS.length]));
    return m;
  }, [deductionCategories]);

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const resetAddForm = () => {
    setNewEmployeeId(employees[0]?.apiId ?? employees[0]?.id ?? '');
    setMultiEmployeeIds([]);
    setEmployeePickerSearch('');
    setNewType(deductionCategories[0]?.code ?? '');
    setNewName('');
    setNewAmount('');
    setNewUnit('amount');
    setNewStartDate(format(new Date(), 'yyyy-MM-dd'));
    setNewEndDate('');
    setNewRecurrence('once');
    setOverrideFormula(false);
  };

  // Deduction codes whose value is owned by the payroll generator's
  // formula, not a number HR types. Selecting one of these types in the
  // dialog locks the Amount/Unit fields by default; HR must explicitly
  // tick "Override formula" to enter a manual number (used for one-off
  // corrections / retroactive adjustments).
  const FORMULA_DRIVEN_TYPES = new Set(['tax', 'nssf', 'first_salary']);
  const isFormulaDrivenType = FORMULA_DRIVEN_TYPES.has(newType.toLowerCase());
  // Clear the override flag whenever HR switches to a different Type,
  // so a previous override doesn't silently survive a Type change.
  useEffect(() => {
    setOverrideFormula(false);
  }, [newType]);

  // Multi-target mode: percentage / day-unit deductions are formulas, so
  // we let the user fan the rule out across many employees in one submit.
  // Formula-driven Types (Tax / NSSF / 1st Salary) always edit a fixed
  // dollar override per employee, so we suppress the multi-employee
  // checkbox-list UI for those — overrides for many employees with one
  // number rarely make sense (each person's tax differs).
  const isMultiTargetMode = !isFormulaDrivenType
    && (newUnit === 'percentage' || newUnit === 'day');

  const handleAddDeduction = async () => {
    // In multi-target mode (% / day) we ignore the single-picker value
    // and require at least one checked employee; otherwise fall back to
    // the single-picker as before.
    const targetIds = isMultiTargetMode
      ? multiEmployeeIds
      : (newEmployeeId ? [newEmployeeId] : []);
    if (targetIds.length === 0) {
      toast.error(isMultiTargetMode ? 'Please select at least one employee' : 'Please pick an employee');
      return;
    }
    if (!newType) { toast.error('Please pick a deduction type'); return; }
    // Tax / NSSF / 1st Salary: the payroll generator owns the value.
    // Block the submit unless HR explicitly checked "Override formula"
    // so a routine click on a formula-driven Type can't silently create
    // a stale manual row that overrides the auto-computation forever.
    if (isFormulaDrivenType && !overrideFormula) {
      toast.error('This type is computed automatically. Tick "Override formula" to enter a manual amount.');
      return;
    }
    if (!newName.trim()) { toast.error('Name is required'); return; }
    const amt = parseFloat(newAmount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Amount must be ≥ 0'); return; }
    if (!newStartDate) { toast.error('Start date is required'); return; }
    if (newRecurrence === 'monthly' && newEndDate && newEndDate < newStartDate) {
      toast.error('End Date must be on or after Start Date');
      return;
    }

    const isPercentage = newUnit === 'percentage';
    const isRecurring  = newRecurrence === 'monthly';
    // Resolve every target to its backend UUID (apiId) once. The dropdown
    // stores apiId in live mode, but fall back to empNo for safety.
    const resolveBackendId = (idFromForm: string) => {
      const emp = employees.find(e => (e.apiId ?? e.id) === idFromForm || e.id === idFromForm);
      return emp?.apiId ?? emp?.id ?? idFromForm;
    };

    if (USE_MOCKS) {
      for (const tid of targetIds) {
        const emp = employees.find(e => e.id === tid || e.apiId === tid);
        const newRow: SalaryDeduction = {
          id: `ded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          employeeId: emp?.id ?? tid,
          name: newName.trim(),
          type: newType,
          amount: amt,
          isPercentage,
          isRecurring,
          startDate: newStartDate,
          endDate: newEndDate || undefined,
          status: 'active',
        };
        setDeductions(prev => [newRow, ...prev]);
      }
      toast.success(targetIds.length === 1
        ? 'Deduction added successfully'
        : `${targetIds.length} deductions added`);
      setDialogOpen(false);
      resetAddForm();
      return;
    }

    try {
      // Sequential per-row dispatch via Promise.allSettled so one failure
      // doesn't drop the rest — same pattern as the Increase form's
      // fan-out submit.
      const results = await Promise.allSettled(
        targetIds.map(tid => deductionsApi.create({
          employeeId: resolveBackendId(tid),
          name: newName.trim(),
          type: newType,
          amount: amt,
          isPercentage,
          isRecurring,
          startDate: newStartDate,
          endDate: isRecurring && newEndDate ? newEndDate : null,
        })),
      );
      const ok = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(ok === 1
          ? 'Deduction added successfully'
          : `${ok} deductions added`);
      } else {
        toast.error(`${failed} of ${results.length} failed — ${ok} added`);
      }
      setDialogOpen(false);
      resetAddForm();
      await loadDeductions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add deduction');
    }
  };

  let filteredDeductions = deductions;

  // Apply date filter based on startDate
  if (dateFilter.start || dateFilter.end) {
    filteredDeductions = filteredDeductions.filter(ded => {
      const dedDate = parseISO(ded.startDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(dedDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return dedDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return dedDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  // Type + Status filters
  if (typeFilter !== 'all') {
    filteredDeductions = filteredDeductions.filter(d => d.type === typeFilter);
  }
  if (statusFilter !== 'all') {
    filteredDeductions = filteredDeductions.filter(d => d.status === statusFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredDeductions = filteredDeductions.filter(d => {
      const emp = employees.find(e => e.id === d.employeeId || e.apiId === d.employeeId);
      const hay = [
        emp?.name, emp?.id, emp?.position, (emp as { khmerName?: string } | undefined)?.khmerName,
        d.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  const getTypeColor = (type: string) =>
    categoryColorMap.get(type) ?? 'bg-gray-100 text-gray-800 hover:bg-gray-100';

  const getTypeLabel = (type: string) => categoryLabelMap.get(type) ?? type;

  const deductionsPagination = usePagination(filteredDeductions, 10);

  useEffect(() => {
    deductionsPagination.resetPage();
    setSelectedIds(new Set());
  }, [dateFilter, typeFilter, statusFilter, searchQuery]);

  const visibleIds = deductionsPagination.paginatedItems.map(d => d.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach(id => next.add(id));
      } else {
        visibleIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleBulkUpdateStatus = async () => {
    if (selectedIds.size === 0) return;
    if (USE_MOCKS) {
      setDeductions(prev => prev.map(d => (selectedIds.has(d.id) ? { ...d, status: bulkStatus } : d)));
      toast.success(`Updated ${selectedIds.size} deduction(s) to ${bulkStatus}`);
      setSelectedIds(new Set());
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      // Single round-trip via the bulk-status endpoint.
      await deductionsApi.setStatus(ids, bulkStatus);
      toast.success(`Updated ${ids.length} deduction(s) to ${bulkStatus}`);
      setSelectedIds(new Set());
      await loadDeductions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update deductions');
    }
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || !!searchQuery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.deduction.title')}</h1>
          <p className="text-gray-500">{t('page.deduction.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee or name…"
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
              {deductionCategories.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-9 px-2 border rounded-md text-sm bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2">
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
              Add Deduction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Salary Deduction</DialogTitle>
              <DialogDescription>Configure a new salary deduction for an employee</DialogDescription>
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
                    const allVisibleIds = filtered.map(e => e.apiId ?? e.id);
                    const allChecked = filtered.length > 0
                      && allVisibleIds.every(id => multiEmployeeIds.includes(id));
                    return (
                      <div className="border rounded-md max-h-56 overflow-y-auto">
                        <label className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50 cursor-pointer sticky top-0">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(c) => {
                              if (c) {
                                const next = new Set(multiEmployeeIds);
                                allVisibleIds.forEach(id => next.add(id));
                                setMultiEmployeeIds(Array.from(next));
                              } else {
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
                          const val = emp.apiId ?? emp.id;
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
                      : 'A day-based rule is computed from each employee\'s daily wage on payroll.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Employee</Label>
                  {/* Same searchable picker as Salary Increase / Manager-Lead.
                      Inactive employees are filtered out of the list. */}
                  <SearchablePicker
                    options={employees
                      .filter(e => e.status === 'active')
                      .map(emp => {
                        const val = emp.apiId ?? emp.id;
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
                <Label>Deduction Type</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {deductionCategories.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., Health Insurance"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              {/* Formula-driven types (Tax / NSSF / 1st Salary) are owned
                  by the payroll generator. Surface an info notice +
                  "Override formula" opt-in instead of the free Amount/Unit
                  pair so HR can't quietly enter "100%" on a Type=Tax row. */}
              {isFormulaDrivenType && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-900">
                    <strong>{deductionCategories.find(c => c.code === newType)?.label}</strong> is
                    computed automatically by the payroll generator from
                    the configured rules. You don't normally need to add
                    a manual row for routine payroll.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                    <Checkbox
                      checked={overrideFormula}
                      onCheckedChange={(c) => setOverrideFormula(!!c)}
                    />
                    <span>Override formula for this employee (one-off correction)</span>
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{newUnit === 'day' ? 'Days' : 'Amount'}</Label>
                  <Input
                    type="number"
                    step={newUnit === 'day' ? '0.5' : '0.01'}
                    placeholder={newUnit === 'day' ? '7.5' : '100'}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    disabled={isFormulaDrivenType && !overrideFormula}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                    value={isFormulaDrivenType ? 'amount' : newUnit}
                    onChange={(e) => setNewUnit(e.target.value as 'amount' | 'percentage' | 'day')}
                    disabled={isFormulaDrivenType}
                  >
                    <option value="amount">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="day">Day(s)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                />
              </div>
              {/* Recurrence picker — same two-button UX as Add Salary
                  Increase. 'monthly' enables the End Date below; 'once'
                  hides it and persists as a single-cycle row. */}
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
              </div>
              {newRecurrence === 'monthly' && (
                <div className="space-y-2">
                  <Label>
                    End Date <span className="text-xs text-gray-500 font-normal">(blank = open-ended)</span>
                  </Label>
                  <Input
                    type="date"
                    value={newEndDate}
                    min={newStartDate || undefined}
                    onChange={(e) => setNewEndDate(e.target.value)}
                  />
                </div>
              )}
              <Button onClick={handleAddDeduction} className="w-full">
                Add Deduction
              </Button>
            </div>
          </DialogContent>
        </Dialog>}
        </div>
      </div>

      {/* One summary card per enabled Deduction category from Payroll
          Categories settings. Counts only currently-active rows.
          Layout matches the Attendance summary strip. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {deductionCategories.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-6 text-center text-sm text-gray-500">
              No deduction categories configured. Add one under{' '}
              <strong>Settings → Payroll Categories</strong> to start
              tracking deductions here.
            </CardContent>
          </Card>
        )}
        {deductionCategories.map((cat) => {
          const rows  = filteredDeductions.filter((d) => d.type === cat.code && d.status === 'active');
          const count = rows.length;
          // Only flat-amount rows can be summed in dollars. Percentage
          // rows are deferred to payroll-run-time (per-employee base).
          const total = rows
            .filter((d) => !d.isPercentage)
            .reduce((sum, d) => sum + d.amount, 0);
          return (
            <Card key={cat.id} className="border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Minus className="h-5 w-5 text-red-600" />
                  <span className="text-2xl font-bold text-red-600">{count}</span>
                </div>
                <p className="text-xs font-medium text-gray-700 truncate" title={cat.label}>{cat.label}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {total > 0 ? `$${formatMoney(total)}/mo` : 'No active rows'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>All Deductions</CardTitle>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border bg-blue-50 px-3 py-1.5">
              <CheckSquare className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {selectedIds.size} selected
              </span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as SalaryDeduction['status'])}
                className="h-8 px-2 border rounded-md text-sm bg-white"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Button size="sm" onClick={handleBulkUpdateStatus}>
                Update {selectedIds.size} row{selectedIds.size > 1 ? 's' : ''}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                    onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                    aria-label="Select all visible"
                  />
                </TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Modifier</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductionsPagination.paginatedItems.map((deduction) => {
                const employee = employees.find(
                  (e) => e.id === deduction.employeeId || e.apiId === deduction.employeeId,
                );
                const isSelected = selectedIds.has(deduction.id);
                return (
                  <TableRow key={deduction.id} data-state={isSelected ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => toggleRowSelection(deduction.id, v === true)}
                        aria-label={`Select ${deduction.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <EmployeeCell employee={employee} />
                    </TableCell>
                    <TableCell>{deduction.name}</TableCell>
                    <TableCell>
                      <Badge className={getTypeColor(deduction.type)}>
                        {getTypeLabel(deduction.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-red-600">
                      {deduction.isPercentage ? `${deduction.amount}%` : `$${formatMoney(deduction.amount)}`}
                    </TableCell>
                    <TableCell>{formatDate(deduction.startDate)}</TableCell>
                    <TableCell>
                      {deduction.endDate ? formatDate(deduction.endDate) : 'Ongoing'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={deduction.status === 'active' ? 'default' : 'secondary'}>
                        {deduction.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AuditCell
                        name={(deduction as any).createdByName}
                        at={(deduction as any).createdAt}
                      />
                    </TableCell>
                    <TableCell>
                      <AuditCell
                        name={(deduction as any).updatedByName}
                        at={(deduction as any).updatedAt}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {canEdit && <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditTarget(deduction); setEditForm({ ...deduction }); }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>}
                        {canRemove && <Button
                          variant="outline"
                          size="sm"
                          disabled={deduction.status !== 'active'}
                          onClick={async () => {
                            if (USE_MOCKS) {
                              setDeductions(prev => prev.map(d => d.id === deduction.id ? { ...d, status: 'cancelled' } : d));
                              toast.success(`Stopped "${deduction.name}"`);
                              return;
                            }
                            try {
                              await deductionsApi.setStatus(deduction.id, 'cancelled');
                              toast.success(`Stopped "${deduction.name}"`);
                              await loadDeductions();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to stop deduction');
                            }
                          }}
                        >
                          Stop
                        </Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            currentPage={deductionsPagination.currentPage}
            totalPages={deductionsPagination.totalPages}
            onPageChange={deductionsPagination.goToPage}
            startIndex={deductionsPagination.startIndex}
            endIndex={deductionsPagination.endIndex}
            totalItems={deductionsPagination.totalItems}
          />
        </CardContent>
      </Card>

      {/* Edit deduction */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); setEditForm(null); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Deduction
            </DialogTitle>
            <DialogDescription>Update the recurring or one-off deduction for this employee.</DialogDescription>
          </DialogHeader>
          {editTarget && editForm && (() => {
            const employee = employees.find(
              (e) => e.id === editTarget.employeeId || e.apiId === editTarget.employeeId,
            );
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-md border">
                  <EmployeeCell employee={employee} subtitle={employee?.position} />
                </div>

                <div className="space-y-1.5">
                  <Label>Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Tax Withholding"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      className="w-full h-9 px-3 border rounded-md text-sm"
                    >
                      {/* Keep the historical value visible even if its category was later disabled. */}
                      {!deductionCategories.some((c) => c.code === editForm.type) && editForm.type && (
                        <option value={editForm.type}>{editForm.type} (inactive)</option>
                      )}
                      {deductionCategories.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as SalaryDeduction['status'] })}
                      className="w-full h-9 px-3 border rounded-md text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>Percentage of salary</span>
                      <Switch
                        checked={editForm.isPercentage}
                        onCheckedChange={(v) => setEditForm({ ...editForm, isPercentage: v })}
                      />
                    </Label>
                    <p className="text-[11px] text-gray-500">
                      {editForm.isPercentage
                        ? `${editForm.amount}% of base salary per cycle`
                        : `$${formatMoney(editForm.amount)} flat per cycle`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={editForm.startDate}
                      onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={editForm.endDate ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value || undefined })}
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 p-3 rounded-md border">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">Recurring</p>
                    <p className="text-[11px] text-gray-500">
                      Apply automatically to every payroll cycle until End Date or Cancelled.
                    </p>
                  </div>
                  <Switch
                    checked={editForm.isRecurring}
                    onCheckedChange={(v) => setEditForm({ ...editForm, isRecurring: v })}
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editForm) return;
                if (!editForm.name.trim()) { toast.error('Name is required'); return; }
                if (!Number.isFinite(editForm.amount) || editForm.amount < 0) { toast.error('Amount must be ≥ 0'); return; }

                if (USE_MOCKS) {
                  setDeductions(prev => prev.map(d => d.id === editForm.id ? editForm : d));
                  toast.success(`Updated "${editForm.name}"`);
                  setEditTarget(null);
                  setEditForm(null);
                  return;
                }

                try {
                  // Map row's `employeeId` (already a UUID in live mode) back to
                  // the backend create/update DTO. Fall back via the employees
                  // list in case the row originated client-side with empNo.
                  const emp = employees.find(
                    (e) => e.id === editForm.employeeId || e.apiId === editForm.employeeId,
                  );
                  const employeeIdForApi = emp?.apiId ?? emp?.id ?? editForm.employeeId;
                  await deductionsApi.update(editForm.id, {
                    employeeId: employeeIdForApi,
                    name: editForm.name.trim(),
                    type: editForm.type,
                    amount: editForm.amount,
                    isPercentage: editForm.isPercentage,
                    isRecurring: editForm.isRecurring,
                    startDate: editForm.startDate,
                    endDate: editForm.endDate || null,
                    status: editForm.status,
                  });
                  // PUT on this endpoint may not honour status — patch it
                  // explicitly if the user changed it.
                  if (editTarget && editTarget.status !== editForm.status) {
                    await deductionsApi.setStatus(editForm.id, editForm.status);
                  }
                  toast.success(`Updated "${editForm.name}"`);
                  setEditTarget(null);
                  setEditForm(null);
                  await loadDeductions();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to update deduction');
                }
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
