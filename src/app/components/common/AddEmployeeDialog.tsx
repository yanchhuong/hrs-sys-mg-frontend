import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { User, Briefcase, CreditCard, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Employee } from '../../types/hrms';
import { mockEmployees, mockDepartments } from '../../data/mockData';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (emp: Employee) => void;
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

export function AddEmployeeDialog({ open, onOpenChange, onCreated }: Props) {
  const [tab, setTab] = useState<'personal' | 'employment' | 'banking'>('personal');
  const [form, setForm] = useState<Partial<Employee>>(blank);

  const patch = (p: Partial<Employee>) => setForm({ ...form, ...p });

  const reset = () => { setForm(blank); setTab('personal'); };

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

  const handleSubmit = () => {
    const err = validateRequired();
    if (err) { toast.error(err); return; }

    if (mockEmployees.some(e => e.id === form.id)) {
      toast.error(`Employee ID "${form.id}" already exists`);
      return;
    }
    if (mockEmployees.some(e => e.email.toLowerCase() === form.email!.toLowerCase())) {
      toast.error(`Email "${form.email}" is already used`);
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
  };

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
              <Field label="Position" required>
                <Input
                  value={form.position ?? ''}
                  onChange={(e) => patch({ position: e.target.value })}
                  placeholder="Junior Developer"
                />
              </Field>
              <Field label="Department" required>
                <select
                  value={form.department ?? ''}
                  onChange={(e) => patch({ department: e.target.value })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="">Select…</option>
                  {mockDepartments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
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
              <Field label="Base Salary ($)" required>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.baseSalary ?? 0}
                  onChange={(e) => patch({ baseSalary: parseFloat(e.target.value) })}
                />
              </Field>
              <Field label="Reports To">
                <select
                  value={form.managerId ?? ''}
                  onChange={(e) => patch({ managerId: e.target.value || undefined })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="">No manager</option>
                  {mockEmployees
                    .filter(e => e.status === 'active')
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name} — {m.position}</option>
                    ))}
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
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {tab !== 'banking' && (
            <Button variant="outline" onClick={() => setTab(tab === 'personal' ? 'employment' : 'banking')}>
              Next
            </Button>
          )}
          <Button onClick={handleSubmit}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
