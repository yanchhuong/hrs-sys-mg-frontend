import { AttendanceRule, OTSettings, PayrollBatch } from '../types/settings';

export const defaultOTSettings: OTSettings = {
  otStartAfter: '17:00',
  minimumOTThresholdMinutes: 30,
  otRoundingMinutes: 30,
  weekdayRate: 1.5,
  weekendRate: 2.0,
  holidayRate: 3.0,
  maxOTHoursPerDay: 4,
  requireApproval: false,
  workdayRule: {
    otStartAfter: '17:00',
    minimumOTMinutes: 30,
    maxOTHours: 4,
    rate: 1.5,
    roundingMinutes: 30,
  },
  weekendRule: {
    countAllHoursAsOT: true,
    rate: 2.0,
    minimumWorkMinutes: 60,
    roundingMinutes: 30,
  },
  holidayRule: {
    holidaySource: 'system_calendar',
    rate: 3.0,
    specialBonusEnabled: false,
    specialBonusAmount: 0,
    roundingMinutes: 30,
  },
  departmentAssignments: [
    { id: 'DA001', department: 'Production', ruleLabel: 'Factory OT', weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 },
    { id: 'DA002', department: 'IT', ruleLabel: 'Custom OT', weekdayRate: 1.5, weekendRate: 2.5, holidayRate: 3.0 },
  ],
  calculationMode: 'factory',
};

export const defaultAttendanceRule: AttendanceRule = {
  id: 'RULE001',
  name: 'Office Hours',
  standardCheckIn: '08:00',
  standardCheckOut: '17:00',
  lateThresholdMinutes: 15,
  otCalculationMode: 'auto',
  isActive: true,
  breakTime: { startTime: '12:00', endTime: '13:00', autoDeduct: true },
  minimumWorkHours: 8,
  allowMultiplePunch: true,
  earlyLeaveEnabled: true,
  autoMarkAbsent: true,
  department: 'All',
  shiftType: 'Day',
};

export const mockAttendanceRules: AttendanceRule[] = [
  defaultAttendanceRule,
  {
    id: 'RULE002',
    name: 'Night Shift',
    standardCheckIn: '20:00',
    standardCheckOut: '05:00',
    lateThresholdMinutes: 15,
    otCalculationMode: 'auto',
    isActive: false,
    breakTime: { startTime: '00:00', endTime: '01:00', autoDeduct: true },
    minimumWorkHours: 8,
    allowMultiplePunch: false,
    earlyLeaveEnabled: true,
    autoMarkAbsent: true,
    department: 'All',
    shiftType: 'Night',
  },
  {
    id: 'RULE003',
    name: 'Sales Team',
    standardCheckIn: '09:00',
    standardCheckOut: '18:00',
    lateThresholdMinutes: 10,
    otCalculationMode: 'manual',
    isActive: true,
    breakTime: { startTime: '12:00', endTime: '13:00', autoDeduct: true },
    minimumWorkHours: 8,
    allowMultiplePunch: false,
    earlyLeaveEnabled: true,
    autoMarkAbsent: true,
    department: 'Sales',
    shiftType: 'Day',
  },
];

// Generated payroll batches covering the last 12 months so admin sees history.
const _generateBatches = (): PayrollBatch[] => {
  const items: PayrollBatch[] = [];
  const today = new Date('2026-04-20');
  const batchTypes: { type: string; subject: string; remarks: string }[] = [
    { type: 'Salary', subject: 'Monthly Salary', remarks: '' },
    { type: 'Salary', subject: 'Monthly Salary', remarks: '' },
    { type: 'Salary & Bonus', subject: 'Monthly Salary + Performance Bonus', remarks: 'Q1 Performance Bonus' },
    { type: 'Salary & Bonus', subject: 'Monthly Salary + Holiday Bonus', remarks: 'Khmer New Year Bonus' },
    { type: 'Bonus', subject: '13th Month Pay', remarks: 'Year-end 13th Month' },
  ];
  // Historical months are Done, one-month-ago is Approved (paid soon), current is Pending.
  // EMP002 is the Manager who uploads; EMP001 is the Admin who approves and completes.
  const uploader = 'EMP002';
  const approver = 'EMP001';

  for (let m = 0; m < 12; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const monthStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-16`;
    const variant = batchTypes[m % batchTypes.length];
    const employees = 110 + ((m * 7) % 8);
    const baseTotalEarnings = employees * (2800 + (m * 37) % 500);
    const bonusMultiplier = variant.type === 'Salary & Bonus' ? 1.15 : 1.0;
    const totalEarnings = Math.round(baseTotalEarnings * bonusMultiplier);
    const deductions = Math.round(totalEarnings * 0.18);

    const uploadedAt = `${dateStr}T10:00:00`;
    const approvedAt = `${dateStr}T14:30:00`;
    const completedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-25T16:00:00`;

    // m=0 → Pending (current month, awaiting admin approval)
    // m=1 → Approved (approved, not yet paid)
    // m≥2 → Done (paid, locked)
    const status: PayrollBatch['status'] =
      m === 0 ? 'pending' :
      m === 1 ? 'approved' :
      'done';

    items.push({
      id: `BATCH${String(items.length + 1).padStart(3, '0')}`,
      date: dateStr,
      monthYear: monthStr,
      type: variant.type,
      subject: `${variant.subject} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`,
      totalEmployees: employees,
      currency: 'USD',
      netSalary: totalEarnings - deductions,
      totalEarnings,
      deductions,
      remarks: variant.remarks,
      uploadedBy: uploader,
      uploadedAt,
      status,
      approvedBy: status !== 'pending' ? approver : undefined,
      approvedAt: status !== 'pending' ? approvedAt : undefined,
      completedBy: status === 'done' ? approver : undefined,
      completedAt: status === 'done' ? completedAt : undefined,
    });
  }
  return items;
};

export const mockPayrollBatches: PayrollBatch[] = _generateBatches();