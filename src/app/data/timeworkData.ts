import { Timetable, Shift, Schedule, Holiday, AttendanceException, SalaryDeduction, SalaryIncrease } from '../types/timework';
import { mockEmployees } from './mockData';

// Re-export mockEmployees for components that need it
export { mockEmployees } from './mockData';

let _s = 111;
const _r = () => { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; };
const _pick = <T,>(arr: T[]) => arr[Math.floor(_r() * arr.length)];
const _randInt = (min: number, max: number) => Math.floor(_r() * (max - min + 1)) + min;
const _pad = (n: number, len = 4) => String(n).padStart(len, '0');

export const mockTimetables: Timetable[] = [
  {
    id: 'TT001',
    name: 'Standard Day Shift',
    startTime: '08:00',
    endTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    workingHours: 8,
    isActive: true,
  },
  {
    id: 'TT002',
    name: 'Night Shift',
    startTime: '20:00',
    endTime: '05:00',
    breakStart: '00:00',
    breakEnd: '01:00',
    workingHours: 8,
    isActive: true,
  },
];

export const mockShifts: Shift[] = [
  {
    id: 'SHIFT001',
    name: 'Day Shift',
    timetableId: 'TT001',
    type: 'day',
    color: '#3b82f6',
    isActive: true,
  },
  {
    id: 'SHIFT002',
    name: 'Night Shift',
    timetableId: 'TT002',
    type: 'night',
    color: '#8b5cf6',
    isActive: true,
  },
];

export const mockHolidays: Holiday[] = [
  { id: 'HOL001', name: 'New Year Day', date: '2026-01-01', type: 'public', isPaid: true },
  { id: 'HOL002', name: 'Victory over Genocide Day', date: '2026-01-07', type: 'public', isPaid: true },
  { id: 'HOL003', name: "International Women's Day", date: '2026-03-08', type: 'public', isPaid: true },
  { id: 'HOL004', name: 'Khmer New Year', date: '2026-04-14', type: 'public', isPaid: true, description: 'Traditional Khmer celebration' },
  { id: 'HOL005', name: 'Khmer New Year', date: '2026-04-15', type: 'public', isPaid: true, description: 'Day 2' },
  { id: 'HOL006', name: 'Khmer New Year', date: '2026-04-16', type: 'public', isPaid: true, description: 'Day 3' },
  { id: 'HOL007', name: 'International Labour Day', date: '2026-05-01', type: 'public', isPaid: true },
  { id: 'HOL008', name: "King's Birthday", date: '2026-05-14', type: 'public', isPaid: true },
  { id: 'HOL009', name: 'Company Anniversary', date: '2026-05-20', type: 'company', isPaid: true },
  { id: 'HOL010', name: 'Visak Bochea', date: '2026-05-23', type: 'public', isPaid: true },
  { id: 'HOL011', name: 'Royal Ploughing Ceremony', date: '2026-05-24', type: 'public', isPaid: true },
  { id: 'HOL012', name: "Queen Mother's Birthday", date: '2026-06-18', type: 'public', isPaid: true },
  { id: 'HOL013', name: 'Constitution Day', date: '2026-09-24', type: 'public', isPaid: true },
  { id: 'HOL014', name: 'Pchum Ben', date: '2026-10-09', type: 'public', isPaid: true, description: 'Ancestors\' Day' },
  { id: 'HOL015', name: 'Pchum Ben', date: '2026-10-10', type: 'public', isPaid: true, description: 'Day 2' },
  { id: 'HOL016', name: 'Pchum Ben', date: '2026-10-11', type: 'public', isPaid: true, description: 'Day 3' },
  { id: 'HOL017', name: "King's Coronation Day", date: '2026-10-29', type: 'public', isPaid: true },
  { id: 'HOL018', name: 'Independence Day', date: '2026-11-09', type: 'public', isPaid: true },
  { id: 'HOL019', name: 'Water Festival', date: '2026-11-23', type: 'public', isPaid: true, description: 'Day 1' },
  { id: 'HOL020', name: 'Water Festival', date: '2026-11-24', type: 'public', isPaid: true, description: 'Day 2' },
  { id: 'HOL021', name: 'Water Festival', date: '2026-11-25', type: 'public', isPaid: true, description: 'Day 3' },
  { id: 'HOL022', name: 'Team Building Day', date: '2026-08-15', type: 'company', isPaid: true, description: 'Annual team retreat' },
];

// ---------------------------------------------------------------------------
// Generated attendance exceptions across many employees
// ---------------------------------------------------------------------------
_s = 321;
const exceptionTypes: AttendanceException['type'][] = ['missed_punch', 'late_arrival', 'early_leave', 'manual_correction'];
const exceptionStatuses: AttendanceException['status'][] = ['pending', 'approved', 'approved', 'rejected'];
const exceptionReasons: Record<AttendanceException['type'], string[]> = {
  missed_punch: ['Forgot to check out', 'Forgot to check in', 'Biometric scanner offline', 'Phone died - could not punch'],
  late_arrival: ['Traffic delay', 'Doctor appointment', 'Family emergency', 'Public transport delay'],
  early_leave: ['Medical appointment', 'Family urgency', 'Childcare pickup', 'Feeling unwell'],
  manual_correction: ['System error - was present', 'Timezone mismatch logged wrong time', 'Duplicate punch cleanup', 'Correction of manager-approved exception'],
};

const _exceptions: AttendanceException[] = [];
mockEmployees.slice(0, 60).forEach((emp, idx) => {
  const count = _randInt(0, 2);
  for (let i = 0; i < count; i++) {
    const daysAgo = _randInt(0, 30);
    const d = new Date('2026-04-20');
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const type = _pick(exceptionTypes);
    const status = _pick(exceptionStatuses);
    const exc: AttendanceException = {
      id: `EXC${_pad(_exceptions.length + 1, 4)}`,
      employeeId: emp.id,
      date: dateStr,
      type,
      reason: _pick(exceptionReasons[type]),
      status,
      submittedBy: emp.id,
      submittedAt: `${dateStr}T${String(_randInt(8, 18)).padStart(2, '0')}:${String(_randInt(0, 59)).padStart(2, '0')}:00`,
    };
    if (type === 'missed_punch') {
      exc.correctedCheckOut = `${17 + _randInt(0, 2)}:${String(_randInt(0, 59)).padStart(2, '0')}`;
    }
    if (type === 'manual_correction' || type === 'late_arrival') {
      exc.originalCheckIn = `${_randInt(9, 10)}:${String(_randInt(0, 59)).padStart(2, '0')}`;
      exc.correctedCheckIn = `${_randInt(8, 9)}:${String(_randInt(0, 59)).padStart(2, '0')}`;
    }
    if (type === 'early_leave') {
      exc.originalCheckOut = `${_randInt(15, 16)}:${String(_randInt(0, 59)).padStart(2, '0')}`;
    }
    if (status !== 'pending') {
      exc.approvedBy = emp.managerId || 'EMP002';
      exc.approvedAt = `${dateStr}T${String(_randInt(10, 19)).padStart(2, '0')}:30:00`;
    }
    _exceptions.push(exc);
  }
});

export const mockExceptions: AttendanceException[] = _exceptions;

// ---------------------------------------------------------------------------
// Generated salary deductions
// ---------------------------------------------------------------------------
_s = 432;
const deductionTypes: SalaryDeduction['type'][] = ['tax', 'insurance', 'loan', 'fine', 'other'];
const deductionNames: Record<SalaryDeduction['type'], string[]> = {
  tax: ['Tax Withholding', 'Income Tax (TOS)', 'Supplementary Tax'],
  insurance: ['Health Insurance', 'NSSF Pension', 'Life Insurance Premium'],
  loan: ['Housing Loan', 'Personal Loan Repayment', 'Company Loan Repayment', 'Vehicle Loan'],
  fine: ['Late Arrival Fine', 'Disciplinary Fine', 'Absenteeism Fine'],
  other: ['Cafeteria Deduction', 'Uniform Deduction', 'Equipment Damage'],
};
const deductionStatuses: SalaryDeduction['status'][] = ['active', 'active', 'active', 'completed', 'cancelled'];

const _deductions: SalaryDeduction[] = [];
mockEmployees.slice(0, 50).forEach(emp => {
  const count = _randInt(0, 2);
  for (let i = 0; i < count; i++) {
    const type = _pick(deductionTypes);
    const isPct = type === 'tax' || (type === 'insurance' && _r() > 0.5);
    const endsIn = _randInt(1, 36);
    const start = new Date(emp.joinDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + endsIn);
    const status = _pick(deductionStatuses);
    _deductions.push({
      id: `DED${_pad(_deductions.length + 1, 4)}`,
      employeeId: emp.id,
      name: _pick(deductionNames[type]),
      type,
      amount: isPct ? _randInt(2, 15) : _randInt(10, 250),
      isPercentage: isPct,
      startDate: start.toISOString().slice(0, 10),
      endDate: type === 'loan' || type === 'fine' ? end.toISOString().slice(0, 10) : undefined,
      isRecurring: type !== 'fine',
      status,
    });
  }
});

export const mockDeductions: SalaryDeduction[] = _deductions;

// ---------------------------------------------------------------------------
// Generated salary increases
// ---------------------------------------------------------------------------
_s = 543;
const increaseTypes: SalaryIncrease['type'][] = ['raise', 'raise', 'bonus', 'bonus', 'promotion'];
const increaseReasons: Record<SalaryIncrease['type'], string[]> = {
  raise: ['Annual performance review', 'Cost of living adjustment', 'Market rate alignment', 'Retention bonus adjustment'],
  bonus: ['Quarterly performance bonus', 'Project completion bonus', 'Year-end bonus', 'Signing bonus completion'],
  promotion: ['Promoted to senior role', 'Team lead promotion', 'Department transfer with promotion', 'Expanded responsibilities'],
};

const _increases: SalaryIncrease[] = [];
mockEmployees.slice(0, 70).forEach((emp, idx) => {
  const count = _randInt(0, 2);
  for (let i = 0; i < count; i++) {
    const type = _pick(increaseTypes);
    const isPct = type === 'raise' && _r() > 0.5;
    const monthsAgo = _randInt(0, 15);
    const eff = new Date('2026-04-20');
    eff.setMonth(eff.getMonth() - monthsAgo);
    const approvedAt = new Date(eff);
    approvedAt.setDate(approvedAt.getDate() - _randInt(7, 30));
    _increases.push({
      id: `INC${_pad(_increases.length + 1, 4)}`,
      employeeId: emp.id,
      type,
      amount: type === 'promotion' ? _randInt(500, 2000) : type === 'bonus' ? _randInt(200, 1500) : isPct ? _randInt(3, 15) : _randInt(100, 800),
      isPercentage: isPct,
      effectiveDate: eff.toISOString().slice(0, 10),
      reason: _pick(increaseReasons[type]),
      approvedBy: 'EMP001',
      approvedAt: approvedAt.toISOString(),
    });
  }
});

export const mockIncreases: SalaryIncrease[] = _increases;
