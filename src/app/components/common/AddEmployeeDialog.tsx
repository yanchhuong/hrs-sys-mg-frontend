import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { User, Briefcase, CreditCard, UserPlus, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { Employee } from '../../types/hrms';
import { mockEmployees } from '../../data/mockData';
import * as employeesApi from '../../api/employees';
import * as departmentsApi from '../../api/departments';
import * as positionsApi from '../../api/positions';
import { USE_MOCKS, ApiError as ApiClientError } from '../../api/client';
import { SearchablePicker } from './SearchablePicker';
import { SeatCapDialog } from './SeatCapDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (emp: Employee) => void;
  /** Live-mode source-of-truth lists. In mock mode the dialog falls back to
   *  bundled mocks so it still works standalone. */
  positions?: positionsApi.Position[];
  departments?: departmentsApi.Department[];
  employees?: Employee[];
}

const blank: Partial<Employee> = {
  id: '',
  name: '',
  khmerName: '',
  email: '',
  position: '',
  department: '',
  joinDate: new Date().toISOString().slice(0, 10),
  status: 'active',
  contactNumber: '',
  baseSalary: 0,
  gender: undefined,
  bankName: '',
  bankAccount: '',
};

export function AddEmployeeDialog({
  open, onOpenChange, onCreated,
  positions = [], departments = [], employees,
}: Props) {
  const [tab, setTab] = useState<'personal' | 'employment' | 'banking'>('personal');
  const [form, setForm] = useState<Partial<Employee>>(blank);
  const [submitting, setSubmitting] = useState(false);
  const [seatCapMessage, setSeatCapMessage] = useState<string | null>(null);

  const patch = (p: Partial<Employee>) => setForm({ ...form, ...p });

  const reset = () => { setForm(blank); setTab('personal'); setSubmitting(false); };

  // Reports-To options: active employees minus the one being created. In
  // mock mode fall back to bundled mocks.
  const candidateManagers = useMemo<Employee[]>(() => {
    const src = employees ?? (USE_MOCKS ? mockEmployees as Employee[] : []);
    return src.filter(e => e.status === 'active' && e.id !== form.id);
  }, [employees, form.id]);

  const deptNameById = useMemo(
    () => new Map(departments.map(d => [d.id, d.name])),
    [departments],
  );

  const validateRequired = (): string | null => {
    if (!form.id?.trim())        return 'Employee ID is required';
    if (!form.name?.trim())      return 'Name is required';
    if (!form.email?.trim())     return 'Email is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email!)) return 'Email is not valid';
    if (!form.position?.trim())  return 'Position is required';
    if (!form.department)        return 'Department is required';
    if (!form.joinDate)          return 'Join date is required';
    if (!Number.isFinite(form.baseSalary) || (form.baseSalary as number) < 0) return 'Base salary must be ≥ 0';
    return null;
  };

  const handleSubmit = async () => {
    const err = validateRequired();
    if (err) { notify.validate(err); return; }

    if (USE_MOCKS) {
      if (mockEmployees.some(e => e.id === form.id)) {
        notify.validate(`Employee ID "${form.id}" already exists`);
        return;
      }
      if (mockEmployees.some(e => e.email.toLowerCase() === form.email!.toLowerCase())) {
        notify.validate(`Email "${form.email}" is already used`);
        return;
      }
      const emp: Employee = {
        ...blank,
        ...form,
        status: (form.status ?? 'active') as Employee['status'],
      } as Employee;
      onCreated(emp);
      toast.success(`Employee ${emp.id} created`);
      reset();
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      // Adapter Employee.department holds the department UUID in live mode.
      const created = await employeesApi.create({
        empNo: form.id!.trim(),
        name: form.name!.trim(),
        khmerName: form.khmerName?.trim() || undefined,
        email: form.email!.trim(),
        position: form.position!.trim(),
        departmentId: form.department || null,
        joinDate: form.joinDate!,
        contactNumber: form.contactNumber?.trim() || undefined,
        baseSalary: form.baseSalary as number,
        // Standing allowances — always send a number; server column is
        // NOT NULL DEFAULT 0.
        positionAllowance: form.positionAllowance ?? 0,
        evaluationAllowance: form.evaluationAllowance ?? 0,
        // V70 — skill level. Blank/null leaves the column unset on the
        // server; the Add Contract dialog falls back to 3-month probation
        // until HR fills it in.
        level: form.level ?? null,
        managerId: form.managerId || null,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        placeOfBirth: form.placeOfBirth?.trim() || undefined,
        currentAddress: form.currentAddress?.trim() || undefined,
        nffNo: form.nffNo?.trim() || undefined,
        tid: form.tid?.trim() || undefined,
        contractExpireDate: form.contractExpireDate || undefined,
        status: form.status || 'active',
      } as employeesApi.CreateEmployeeRequest);
      toast.success(`Employee ${created.empNo} created`);
      // Pass a minimal Employee shape — parent refetches the live list anyway.
      onCreated({ ...(form as Employee), id: created.empNo, status: created.status as Employee['status'] });
      reset();
      onOpenChange(false);
    } catch (e) {
      // v-employee-seat-cap — plan cap reached returns HTTP 402. Open a
      // dedicated dialog instead of the generic toast so the operator
      // gets clear guidance to contact their platform admin.
      if (e instanceof ApiClientError && e.status === 402) {
        setSeatCapMessage(e.message || 'Employee seat cap reached for this plan.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to create employee');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Position options scope to the chosen department; cross-dept positions
  // (no departmentId) always pass through. In mock mode there's no API list,
  // so the picker is empty and the user falls back to typing freely — but
  // in mock mode the picker still renders the helper hint.
  const positionOptions = useMemo(() => {
    return positions
      .filter(p => !form.department || !p.departmentId || p.departmentId === form.department)
      .map(p => ({
        value: p.name,
        label: p.name,
        secondary: p.departmentId ? deptNameById.get(p.departmentId) : undefined,
      }));
  }, [positions, form.department, deptNameById]);

  const departmentOptions = useMemo(() => {
    if (USE_MOCKS) {
      // mock mode: department is stored as the name. Fall back to bundled
      // catalog when no live list is available.
      const list = departments.length > 0 ? departments : [];
      return list.map(d => ({ value: d.name, label: d.name }));
    }
    return departments.map(d => ({ value: d.id, label: d.name }));
  }, [departments]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Employee
          </DialogTitle>
          <DialogDescription>Create a single employee record. Use Upload Bulk for multiple at once.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="px-6 pt-4">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="personal"><User className="h-3.5 w-3.5 mr-1.5" />Personal</TabsTrigger>
            <TabsTrigger value="employment"><Briefcase className="h-3.5 w-3.5 mr-1.5" />Employment</TabsTrigger>
            <TabsTrigger value="banking"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Banking</TabsTrigger>
          </TabsList>

          {/* Personal */}
          <TabsContent value="personal" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee ID" required>
                <Input
                  value={form.id ?? ''}
                  onChange={(e) => patch({ id: e.target.value.trim() })}
                  placeholder="EMP128"
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status ?? 'active'}
                  onChange={(e) => patch({ status: e.target.value as Employee['status'] })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <Input
                  value={form.name ?? ''}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Dara Sok"
                />
              </Field>
              <Field label="Khmer Name">
                <Input
                  value={form.khmerName ?? ''}
                  onChange={(e) => patch({ khmerName: e.target.value })}
                  placeholder="តារា សុខ"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gender">
                <select
                  value={form.gender ?? ''}
                  onChange={(e) => patch({ gender: e.target.value as 'male' | 'female' })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
              <Field label="Date of Birth">
                <Input
                  type="date"
                  value={form.dateOfBirth ?? ''}
                  onChange={(e) => patch({ dateOfBirth: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" required>
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="dara@company.com"
                />
              </Field>
              <Field label="Contact Number">
                <Input
                  value={form.contactNumber ?? ''}
                  onChange={(e) => patch({ contactNumber: e.target.value })}
                  placeholder="+855-12-345-678"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Place of Birth">
                <Input
                  value={form.placeOfBirth ?? ''}
                  onChange={(e) => patch({ placeOfBirth: e.target.value })}
                  placeholder="Phnom Penh"
                />
              </Field>
              <Field label="Current Address">
                <Input
                  value={form.currentAddress ?? ''}
                  onChange={(e) => patch({ currentAddress: e.target.value })}
                  placeholder="Street, District, City"
                />
              </Field>
            </div>
          </TabsContent>

          {/* Employment */}
          <TabsContent value="employment" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department" required>
                <SearchablePicker
                  options={departmentOptions}
                  value={form.department ?? ''}
                  onChange={v => patch({ department: v })}
                  placeholder="Select department…"
                  searchPlaceholder="Search department…"
                  allowClear={false}
                />
              </Field>
              <Field label="Position" required>
                <SearchablePicker
                  options={positionOptions}
                  value={form.position ?? ''}
                  onChange={v => patch({ position: v })}
                  placeholder="Select position…"
                  searchPlaceholder="Search position…"
                  emptyOptionsHint={
                    <>No positions defined yet — add some in <span className="font-medium">Settings → Employee Settings → Positions</span>.</>
                  }
                  allowClear={false}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Join Date" required>
                <Input
                  type="date"
                  value={form.joinDate ?? ''}
                  onChange={(e) => patch({ joinDate: e.target.value })}
                />
              </Field>
              <Field label="Contract Expires">
                <Input
                  type="date"
                  value={form.contractExpireDate ?? ''}
                  onChange={(e) => patch({ contractExpireDate: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Basic Salary ($)" required>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.baseSalary ?? 0}
                  onChange={(e) => patch({ baseSalary: parseFloat(e.target.value) })}
                />
              </Field>
              <Field label="Reports To">
                <SearchablePicker
                  options={candidateManagers.map(m => ({
                    value: m.apiId ?? m.id,
                    label: m.name,
                    secondary: m.position,
                    searchKey: `${m.name} ${m.id} ${m.position ?? ''}`,
                  }))}
                  value={form.managerId ?? ''}
                  onChange={v => patch({ managerId: v || undefined })}
                  placeholder="Select manager…"
                  emptyLabel="No manager"
                  searchPlaceholder="Search by name, ID, position…"
                />
              </Field>
            </div>
            {/* Standing earnings on the Employee record. NOT NULL DEFAULT 0
                on the server (V43): we always send a number, never blank. */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Position Allowance ($)">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={form.positionAllowance ?? 0}
                  onChange={(e) => patch({ positionAllowance: parseFloat(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Evaluation Allowance ($)">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={form.evaluationAllowance ?? 0}
                  onChange={(e) => patch({ evaluationAllowance: parseFloat(e.target.value) || 0 })}
                />
              </Field>
            </div>
            {/* V70 — Cambodian Labour Law skill level. Drives the
                probation-max default on the Add Contract dialog. The
                probation breakdown lives in a tooltip on the label so
                the dropdown stays compact. */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={
                  <TooltipProvider delayDuration={150}>
                    <span className="inline-flex items-center gap-1">
                      Level (Cambodian Labour Law)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
                            aria-label="Probation caps by level"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-left text-xs leading-relaxed">
                          <p className="font-semibold mb-1">Probation maximum (Cambodian Labour Law)</p>
                          <ul className="space-y-0.5">
                            <li>• <strong>Office Personnel</strong>: 3 months</li>
                            <li>• <strong>Specialized</strong>: 3 months</li>
                            <li>• <strong>Non-Specialized · Cook</strong>: 1 month</li>
                            <li>• <strong>Non-Specialized · Labour</strong>: 2 months</li>
                          </ul>
                          <p className="mt-1.5 opacity-80">The Add Contract dialog reads this to pre-fill the probation end date.</p>
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </TooltipProvider>
                }
              >
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
                  value={form.level ?? ''}
                  onChange={(e) => patch({ level: (e.target.value || undefined) as typeof form.level })}
                >
                  <option value="">— not set —</option>
                  <option value="office">Office Personnel</option>
                  <option value="specialized">Specialized</option>
                  <option value="ns_cook">Non-Specialized · Cook</option>
                  <option value="ns_labour">Non-Specialized · Labour</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="NFF No">
                <Input
                  value={form.nffNo ?? ''}
                  onChange={(e) => patch({ nffNo: e.target.value })}
                  placeholder="NFF000128"
                />
              </Field>
              <Field label="TID">
                <Input
                  value={form.tid ?? ''}
                  onChange={(e) => patch({ tid: e.target.value })}
                  placeholder="TID000128"
                />
              </Field>
            </div>
          </TabsContent>

          {/* Banking */}
          <TabsContent value="banking" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name">
                <select
                  value={form.bankName ?? ''}
                  onChange={(e) => patch({ bankName: e.target.value })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="">Select bank…</option>
                  {['ABA', 'ACLEDA', 'Canadia', 'Chip Mong', 'Maybank', 'PPCB', 'Prince', 'SKB', 'Other'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Account Number">
                <Input
                  value={form.bankAccount ?? ''}
                  onChange={(e) => patch({ bankAccount: e.target.value })}
                  placeholder="000-123-456"
                />
              </Field>
            </div>
            <div className="rounded-md bg-gray-50 border p-3 text-xs text-gray-600">
              Payroll disbursements use these details. Employees can update their own from Settings after first login; changes trigger a Finance notification.
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t bg-gray-50 gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>Cancel</Button>
          {tab !== 'banking' && (
            <Button variant="outline" onClick={() => setTab(tab === 'personal' ? 'employment' : 'banking')} disabled={submitting}>
              Next
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            <UserPlus className="h-4 w-4 mr-2" />
            {submitting ? 'Creating…' : 'Create Employee'}
          </Button>
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

function Field({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
