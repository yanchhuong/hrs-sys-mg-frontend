import { User, Employee, Attendance, OTRequest, PayrollItem, Contract, Department } from '../types/hrms';

// ---------------------------------------------------------------------------
// Deterministic pseudo-random so refresh produces identical data.
// ---------------------------------------------------------------------------
let _seed = 42;
const rand = () => {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pad = (n: number, len = 3) => String(n).padStart(len, '0');
const pad2 = (n: number) => String(n).padStart(2, '0');

const resetSeed = (s: number) => { _seed = s; };

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const firstNamesMale = ['Sophea', 'Chanra', 'Dara', 'Pheakdey', 'Rith', 'Vuthy', 'Bunthoeun', 'Kosal', 'Thida', 'Sothea', 'Veasna', 'Kimsan', 'John', 'Michael', 'David', 'James', 'Robert', 'William', 'Richard', 'Thomas', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Steven'];
const firstNamesFemale = ['Srey', 'Kunthea', 'Nary', 'Sokha', 'Chenda', 'Phalla', 'Reaksa', 'Nisa', 'Malis', 'Bopha', 'Mom', 'Dany', 'Sarah', 'Emily', 'Jessica', 'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Abigail'];
const lastNames = ['Chan', 'Sok', 'Heng', 'Meas', 'Kong', 'Chea', 'Seng', 'Lim', 'Kim', 'Tan', 'Nguyen', 'Ly', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez'];
const khmerFirstM = ['សុភា', 'ច័ន្ទរ៉ា', 'តារា', 'ភក្ដី', 'រិទ្ធ', 'វុទ្ធី', 'ប៊ុនធឿន', 'កុសល'];
const khmerFirstF = ['ស្រី', 'គន្ធា', 'នារី', 'សុខា', 'ច័ន្ទដា', 'ផល្លា', 'រក្សា', 'និសា'];
const khmerLast = ['ចាន់', 'សុខ', 'ហេង', 'មាស', 'កុង', 'ជា', 'សេង', 'លឹម'];
const cities = ['Phnom Penh', 'Siem Reap', 'Battambang', 'Kampot', 'Kandal', 'Sihanoukville', 'Kampong Cham', 'Takeo'];
const banks = ['ABA', 'ACLEDA', 'PPCB', 'SKB', 'Canadia', 'Prince', 'Maybank', 'Chip Mong'];

const departmentCatalog: { id: string; name: string; description: string; positions: string[]; managerPos: string }[] = [
  { id: 'DEPT001', name: 'Engineering', description: 'Software development and technical infrastructure', managerPos: 'Engineering Manager', positions: ['Senior Developer', 'Frontend Developer', 'Backend Developer', 'QA Engineer', 'DevOps Engineer', 'Mobile Developer', 'Software Architect', 'Junior Developer'] },
  { id: 'DEPT002', name: 'Human Resources', description: 'Employee management and recruitment', managerPos: 'HR Manager', positions: ['HR Specialist', 'Recruiter', 'HR Assistant', 'Training Coordinator', 'Payroll Specialist'] },
  { id: 'DEPT003', name: 'Sales', description: 'Sales and business development', managerPos: 'Sales Manager', positions: ['Sales Representative', 'Account Manager', 'Business Development', 'Sales Associate', 'Regional Sales Lead'] },
  { id: 'DEPT004', name: 'Marketing', description: 'Brand, content and growth', managerPos: 'Marketing Manager', positions: ['Marketing Specialist', 'Content Writer', 'SEO Analyst', 'Social Media Manager', 'Graphic Designer'] },
  { id: 'DEPT005', name: 'Finance', description: 'Accounting, budgeting and financial reporting', managerPos: 'Finance Manager', positions: ['Accountant', 'Financial Analyst', 'Auditor', 'Bookkeeper', 'Tax Specialist'] },
  { id: 'DEPT006', name: 'Operations', description: 'Day-to-day operations and logistics', managerPos: 'Operations Manager', positions: ['Operations Analyst', 'Logistics Coordinator', 'Procurement Officer', 'Warehouse Supervisor', 'Quality Control'] },
  { id: 'DEPT007', name: 'Customer Support', description: 'Customer service and client success', managerPos: 'Support Manager', positions: ['Support Agent', 'Client Success Manager', 'Technical Support', 'Call Center Agent', 'Support Lead'] },
  { id: 'DEPT008', name: 'IT Infrastructure', description: 'Networks, servers and internal IT', managerPos: 'IT Infrastructure Manager', positions: ['System Administrator', 'Network Engineer', 'IT Support', 'Security Analyst', 'Database Administrator'] },
];

// ---------------------------------------------------------------------------
// Build Employees: 1 admin + 8 managers + 111 staff = 120
// ---------------------------------------------------------------------------
interface BuiltEmp extends Employee {
  _role: 'admin' | 'manager' | 'employee';
  _departmentId: string;
}

resetSeed(42);
const TODAY = new Date('2026-04-20');

const makeEmail = (name: string, id: string) =>
  `${name.toLowerCase().replace(/[^a-z]/g, '')}.${id.toLowerCase()}@company.com`;

const buildEmployee = (
  seq: number,
  role: 'admin' | 'manager' | 'employee',
  dept: typeof departmentCatalog[0],
  managerId?: string,
  overrides?: Partial<Employee>
): BuiltEmp => {
  const id = `EMP${pad(seq)}`;
  const gender: 'male' | 'female' = rand() > 0.5 ? 'male' : 'female';
  const first = gender === 'male' ? pick(firstNamesMale) : pick(firstNamesFemale);
  const last = pick(lastNames);
  const khmerFirst = gender === 'male' ? pick(khmerFirstM) : pick(khmerFirstF);
  const khmerLastName = pick(khmerLast);
  const name = `${first} ${last}`;
  const position =
    role === 'admin' ? 'System Administrator' :
    role === 'manager' ? dept.managerPos :
    pick(dept.positions);
  const baseSalary =
    role === 'admin' ? 7500 + randInt(0, 2000) :
    role === 'manager' ? 6500 + randInt(500, 2500) :
    2500 + randInt(0, 3000);
  // join dates: admin/manager join earlier
  const yearsAgo = role === 'admin' ? randInt(3, 5) : role === 'manager' ? randInt(2, 4) : randInt(0, 3);
  const joinDateObj = new Date(TODAY);
  joinDateObj.setFullYear(joinDateObj.getFullYear() - yearsAgo);
  joinDateObj.setMonth(randInt(0, 11));
  joinDateObj.setDate(randInt(1, 28));
  const joinDate = joinDateObj.toISOString().slice(0, 10);

  const dobYear = 1970 + randInt(0, 30);
  const dateOfBirth = `${dobYear}-${pad2(randInt(1, 12))}-${pad2(randInt(1, 28))}`;

  const contractYears = randInt(1, 3);
  const contractExpire = new Date(joinDateObj);
  contractExpire.setFullYear(contractExpire.getFullYear() + contractYears);
  const contractExpireDate = contractExpire.toISOString().slice(0, 10);

  return {
    id,
    name,
    khmerName: `${khmerFirst} ${khmerLastName}`,
    email: makeEmail(first, id),
    position,
    department: dept.name,
    joinDate,
    status: rand() > 0.95 ? 'inactive' : 'active',
    contactNumber: `+855-${randInt(10, 99)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    baseSalary,
    managerId,
    gender,
    dateOfBirth,
    placeOfBirth: pick(cities),
    currentAddress: `${randInt(1, 999)} ${pick(['Main', 'Central', 'River', 'Garden', 'Market', 'Temple', 'Lake', 'Palace'])} Street, ${pick(cities)}, Cambodia`,
    nffNo: `NFF${pad(seq, 6)}`,
    tid: `TID${pad(seq, 6)}`,
    contractExpireDate,
    _role: role,
    _departmentId: dept.id,
    ...overrides,
  };
};

// Anchor employees matching original login accounts
const anchorEmps: BuiltEmp[] = [
  buildEmployee(1, 'admin', departmentCatalog[1], undefined, {
    name: 'Admin User',
    khmerName: 'អ្នកគ្រប់គ្រង',
    email: 'admin@company.com',
    baseSalary: 8000,
    joinDate: '2023-01-15',
    gender: 'male',
    dateOfBirth: '1985-05-15',
    placeOfBirth: 'Phnom Penh',
    contactNumber: '+855-12-000-0001',
    contractExpireDate: '2027-01-15',
  }),
  buildEmployee(2, 'manager', departmentCatalog[0], undefined, {
    name: 'Sarah Johnson',
    khmerName: 'សារ៉ា ចនសុន',
    email: 'manager@company.com',
    baseSalary: 9000,
    joinDate: '2023-03-20',
    gender: 'female',
    dateOfBirth: '1988-08-22',
    placeOfBirth: 'Siem Reap',
    contactNumber: '+855-12-000-0002',
    contractExpireDate: '2027-03-20',
  }),
  buildEmployee(3, 'employee', departmentCatalog[0], 'EMP002', {
    name: 'John Smith',
    khmerName: 'ចន ស្មីត',
    email: 'john@company.com',
    position: 'Senior Developer',
    baseSalary: 6000,
    joinDate: '2024-06-10',
    gender: 'male',
    dateOfBirth: '1992-03-10',
    placeOfBirth: 'Battambang',
    contactNumber: '+855-12-000-0003',
    contractExpireDate: '2026-06-10',
  }),
  buildEmployee(4, 'employee', departmentCatalog[0], 'EMP002', {
    name: 'Emily Davis',
    khmerName: 'អេមីលី ដេវីស',
    email: 'sarah@company.com',
    position: 'Frontend Developer',
    baseSalary: 5500,
    joinDate: '2024-09-01',
    gender: 'female',
    dateOfBirth: '1995-11-25',
    placeOfBirth: 'Kampot',
    contactNumber: '+855-12-000-0004',
    contractExpireDate: '2026-05-15',
  }),
  buildEmployee(5, 'employee', departmentCatalog[2], 'EMP002', {
    name: 'Michael Brown',
    khmerName: 'ម៉ៃឃើល ប្រោន',
    email: 'michael@company.com',
    position: 'Sales Representative',
    baseSalary: 4500,
    joinDate: '2025-01-15',
    gender: 'male',
    dateOfBirth: '1990-07-18',
    placeOfBirth: 'Kandal',
    contactNumber: '+855-12-000-0005',
    contractExpireDate: '2027-01-15',
  }),
];

// Generate one manager per remaining department (EMP006+). Admin (EMP001)
// doubles as HR department manager.
const managers: BuiltEmp[] = [];
for (let i = 1; i < departmentCatalog.length; i++) {
  const dept = departmentCatalog[i];
  if (dept.id === 'DEPT002') continue;
  const seq = 5 + managers.length + 1; // start at EMP006
  managers.push(buildEmployee(seq, 'manager', dept));
}

const employees: BuiltEmp[] = [...anchorEmps, ...managers];

// Generate regular staff until total 120
let nextSeq = employees.length + 1;
const managerIdsByDept = new Map<string, string>();
anchorEmps.forEach(e => { if (e._role === 'manager') managerIdsByDept.set(e._departmentId, e.id); });
managers.forEach(m => managerIdsByDept.set(m._departmentId, m.id));
// Admin covers the HR department as its manager
managerIdsByDept.set('DEPT002', 'EMP001');

while (employees.length < 120) {
  const dept = departmentCatalog[nextSeq % departmentCatalog.length];
  const mgrId = managerIdsByDept.get(dept.id);
  employees.push(buildEmployee(nextSeq, 'employee', dept, mgrId));
  nextSeq++;
}

// ---------------------------------------------------------------------------
// Exported core arrays
// ---------------------------------------------------------------------------
export const mockEmployees: Employee[] = employees.map(({ _role, _departmentId, ...e }) => e);

export const mockDepartments: Department[] = departmentCatalog.map(d => ({
  id: d.id,
  name: d.name,
  managerId: managerIdsByDept.get(d.id),
  employeeCount: employees.filter(e => e._departmentId === d.id).length,
  description: d.description,
}));

// Users: keep legacy demo accounts + one user per manager + a few sample employee logins
const usersSeed: User[] = [
  { id: '1', email: 'admin@company.com', password: 'admin123', role: 'admin', employeeId: 'EMP001', departmentId: 'DEPT002', createdAt: '2023-01-10T00:00:00', lastLogin: '2026-04-20T08:30:00', isActive: true },
  { id: '2', email: 'manager@company.com', password: 'manager123', role: 'manager', employeeId: 'EMP002', departmentId: 'DEPT001', createdAt: '2023-03-15T00:00:00', lastLogin: '2026-04-19T09:15:00', isActive: true },
  { id: '3', email: 'john@company.com', password: 'john123', role: 'employee', employeeId: 'EMP003', departmentId: 'DEPT001', createdAt: '2024-06-05T00:00:00', lastLogin: '2026-04-20T08:45:00', isActive: true },
  { id: '4', email: 'sarah@company.com', password: 'sarah123', role: 'employee', employeeId: 'EMP004', departmentId: 'DEPT001', createdAt: '2024-08-25T00:00:00', lastLogin: '2026-04-20T09:00:00', isActive: true },
  { id: '5', email: 'michael@company.com', password: 'michael123', role: 'employee', employeeId: 'EMP005', departmentId: 'DEPT003', createdAt: '2025-01-10T00:00:00', lastLogin: '2026-04-19T16:30:00', isActive: true },
];

// Additional logins for each manager (not anchored) and every 4th employee
managers.forEach((m, idx) => {
  usersSeed.push({
    id: String(usersSeed.length + 1),
    email: m.email,
    password: 'manager123',
    role: 'manager',
    employeeId: m.id,
    departmentId: m._departmentId,
    createdAt: m.joinDate + 'T00:00:00',
    lastLogin: `2026-04-${pad2(18 + (idx % 3))}T09:00:00`,
    isActive: true,
  });
});

employees.filter(e => e._role === 'employee' && e.id !== 'EMP003' && e.id !== 'EMP004' && e.id !== 'EMP005').forEach((e, idx) => {
  if (idx % 3 !== 0) return; // only some get login accounts
  usersSeed.push({
    id: String(usersSeed.length + 1),
    email: e.email,
    password: 'emp123',
    role: 'employee',
    employeeId: e.id,
    departmentId: e._departmentId,
    createdAt: e.joinDate + 'T00:00:00',
    lastLogin: `2026-04-${pad2(randInt(10, 20))}T${pad2(randInt(8, 18))}:00:00`,
    isActive: e.status === 'active',
  });
});

export const mockUsers: User[] = usersSeed;

// ---------------------------------------------------------------------------
// Attendance: last 30 days for all employees
// ---------------------------------------------------------------------------
resetSeed(1234);

const attendance: Attendance[] = [];
let attSeq = 1;
const STATUSES: { status: Attendance['status']; weight: number }[] = [
  { status: 'present', weight: 70 },
  { status: 'late', weight: 10 },
  { status: 'early_leave', weight: 3 },
  { status: 'leave', weight: 6 },
  { status: 'absent', weight: 5 },
  { status: 'no_checkin', weight: 3 },
  { status: 'no_checkout', weight: 3 },
];
const totalWeight = STATUSES.reduce((s, x) => s + x.weight, 0);
const pickStatus = (): Attendance['status'] => {
  let r = rand() * totalWeight;
  for (const s of STATUSES) {
    if ((r -= s.weight) <= 0) return s.status;
  }
  return 'present';
};
const leaveReasons = ['Annual leave', 'Sick leave - flu', 'Family event', 'Medical appointment', 'Personal day'];
const lateReasons = ['Traffic delay', 'Overslept', 'Family emergency', 'Transport issue'];

for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) continue; // skip weekends
  const dateStr = d.toISOString().slice(0, 10);

  employees.forEach(emp => {
    if (new Date(emp.joinDate) > d) return; // not yet joined
    const status = pickStatus();
    const base: Attendance = { id: `ATT${pad(attSeq++, 5)}`, employeeId: emp.id, date: dateStr, checkIn: '', status };
    if (status === 'present' || status === 'late' || status === 'early_leave' || status === 'no_checkout') {
      const checkInHour = status === 'late' ? 9 : 8;
      const checkInMin = status === 'late' ? randInt(15, 45) : randInt(20, 59);
      const morningIn = `${pad2(checkInHour)}:${pad2(checkInMin)}`;
      base.morningIn = morningIn;
      base.checkIn = morningIn;
      base.morningOut = '12:00';
      if (status !== 'no_checkout') {
        base.noonIn = '13:00';
        const endHour = status === 'early_leave' ? randInt(15, 16) : randInt(17, 19);
        const endMin = randInt(0, 59);
        const noonOut = `${pad2(endHour)}:${pad2(endMin)}`;
        base.noonOut = noonOut;
        base.checkOut = noonOut;
        const ot = endHour >= 18 ? +(endHour - 17 + endMin / 60).toFixed(2) : 0;
        if (ot > 0.5) base.otHours = +ot.toFixed(2);
        const morningHours = 12 - (checkInHour + checkInMin / 60);
        const afternoonHours = (endHour + endMin / 60) - 13;
        base.workHours = +(morningHours + Math.min(afternoonHours, 4)).toFixed(2);
      }
      if (status === 'late') base.notes = pick(lateReasons);
      if (status === 'early_leave') base.notes = 'Left early - ' + pick(leaveReasons);
    } else if (status === 'no_checkin') {
      // nothing
    } else if (status === 'leave') {
      base.notes = pick(leaveReasons);
    }
    // absent: already set
    attendance.push(base);
  });
}

export const mockAttendance: Attendance[] = attendance;

// ---------------------------------------------------------------------------
// OT Requests
// ---------------------------------------------------------------------------
resetSeed(9999);
const otRequests: OTRequest[] = [];
const otReasons = ['Project deadline', 'Bug fixing', 'Client demo preparation', 'Month-end reporting', 'System maintenance', 'Year-end closing', 'Emergency support', 'Release preparation'];
const otStatuses: OTRequest['status'][] = ['pending', 'approved', 'approved', 'approved', 'rejected'];

employees.forEach((emp, idx) => {
  if (emp._role === 'admin') return;
  const count = randInt(0, 4);
  for (let i = 0; i < count; i++) {
    const daysAgo = randInt(0, 30);
    const d = new Date(TODAY);
    d.setDate(d.getDate() - daysAgo);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const status = otStatuses[randInt(0, otStatuses.length - 1)];
    const mgrId = managerIdsByDept.get(emp._departmentId) || 'EMP002';
    otRequests.push({
      id: `OT${pad(otRequests.length + 1, 4)}`,
      employeeId: emp.id,
      date: d.toISOString().slice(0, 10),
      hours: randInt(1, 4),
      reason: pick(otReasons),
      status,
      requestedAt: `${d.toISOString().slice(0, 10)}T${pad2(randInt(14, 20))}:${pad2(randInt(0, 59))}:00`,
      approvedBy: status !== 'pending' ? mgrId : undefined,
      approvedAt: status !== 'pending' ? `${d.toISOString().slice(0, 10)}T${pad2(randInt(14, 20))}:30:00` : undefined,
      isWeekend,
      isHoliday: rand() > 0.95,
    });
  }
});

export const mockOTRequests: OTRequest[] = otRequests;

// ---------------------------------------------------------------------------
// Payroll: last 3 months for all active employees
// ---------------------------------------------------------------------------
resetSeed(5555);
const payroll: PayrollItem[] = [];
const currentMonth = TODAY.getMonth(); // 0-based; April=3
const currentYear = TODAY.getFullYear();

for (let m = 1; m <= 3; m++) {
  const date = new Date(currentYear, currentMonth - m, 1);
  const monthStr = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  employees.forEach(emp => {
    if (emp.status !== 'active') return;
    if (new Date(emp.joinDate) > date) return;
    const base = emp.baseSalary;
    const positionAllowance = emp._role === 'manager' ? 300 : emp._role === 'admin' ? 400 : randInt(100, 250);
    const evaluationAllowance = randInt(200, 900);
    const otHours = randInt(0, 12);
    const otRate = (base / 160) * 1.5;
    const otPay = +(otHours * otRate).toFixed(2);
    const totalEarnings = base + positionAllowance + evaluationAllowance + otPay;
    const firstSalaryDeduction = Math.round(base * 0.15);
    const nssfPension = +(base * 0.02).toFixed(2);
    const taxOnSalary = +(totalEarnings * 0.07).toFixed(2);
    const deductions = +(firstSalaryDeduction + nssfPension + taxOnSalary).toFixed(2);
    const totalPay = +(totalEarnings - deductions).toFixed(2);
    payroll.push({
      id: `PAY${pad(payroll.length + 1, 4)}`,
      employeeId: emp.id,
      month: monthStr,
      baseSalary: base,
      positionAllowance,
      evaluationAllowance,
      otHours,
      otPay,
      firstSalaryDeduction,
      nssfPension,
      taxOnSalary,
      otherDeductions: 0,
      deductions,
      totalPay,
      totalEarnings,
      payrollAccount: `${pick(banks)} ${randInt(100, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
      currency: 'USD',
      generatedAt: `${monthStr}-28T00:00:00`,
      approvedBy: 'EMP001',
    });
  });
}

export const mockPayroll: PayrollItem[] = payroll;

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
resetSeed(7777);
const contracts: Contract[] = [];
const contractTypes = ['Permanent', 'Fixed Term', 'Probation'];
const notesByStatus: Record<string, string[]> = {
  active: ['Full-time employment contract', 'Standard employment agreement', 'Management position contract'],
  expiring: ['Contract expiring soon - renewal recommended', 'Renewal review pending', 'End of probation - evaluation required'],
  expired: ['Needs renewal', 'Previous contract - replaced', 'Employment ended'],
};

employees.forEach(emp => {
  const expire = emp.contractExpireDate ? new Date(emp.contractExpireDate) : new Date(TODAY);
  const daysToExpire = Math.floor((expire.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
  const status: Contract['status'] = daysToExpire < 0 ? 'expired' : daysToExpire < 30 ? 'expiring' : 'active';
  const startDate = emp.joinDate;
  contracts.push({
    id: `CNT${pad(contracts.length + 1, 4)}`,
    employeeId: emp.id,
    startDate,
    endDate: emp.contractExpireDate || startDate,
    status,
    contractType: pick(contractTypes),
    salary: emp.baseSalary,
    notes: pick(notesByStatus[status]),
    createdAt: `${startDate}T00:00:00`,
  });
});

// Add a few renewal history examples for anchor employees
const anchorContracts: Contract[] = [
  {
    id: 'CNT-LEGACY-001',
    employeeId: 'EMP001',
    startDate: '2023-01-15',
    endDate: '2025-01-15',
    status: 'expired',
    contractType: 'Permanent',
    salary: 7500,
    notes: 'Initial employment contract',
    renewedTo: contracts.find(c => c.employeeId === 'EMP001')?.id,
    createdAt: '2023-01-10T00:00:00',
  },
  {
    id: 'CNT-LEGACY-002',
    employeeId: 'EMP002',
    startDate: '2023-03-20',
    endDate: '2025-03-20',
    status: 'expired',
    contractType: 'Permanent',
    salary: 8500,
    notes: 'Initial management contract',
    renewedTo: contracts.find(c => c.employeeId === 'EMP002')?.id,
    createdAt: '2023-03-15T00:00:00',
  },
];

export const mockContracts: Contract[] = [...contracts, ...anchorContracts];
