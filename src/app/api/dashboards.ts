/**
 * V316 — dynamic multi-category Dashboard.
 *
 * The FE loads the current user's available categories (server has
 * already intersected them with tenant modules + role permissions),
 * renders one tab per category, and calls the batched summary
 * endpoint for whichever tab is selected.
 */
import { apiJson } from './client';

export interface DashboardCategory {
  code: string;
  name: string;
  description: string | null;
  /** Lucide icon name (kebab-case). FE maps to a component. */
  icon: string | null;
  sortOrder: number;
}

/**
 * Batched summary payload — one call returns everything the tab's
 * widgets need. HR currently returns the legacy /summary shape; the
 * other categories return a "coming_soon" stub until their widgets
 * ship. Widgets should check {@link isComingSoon} before trying to
 * read category-specific fields.
 */
export interface DashboardSummary {
  category?: string;
  status?: 'coming_soon' | string;
  message?: string;
  /** HR / legacy fields — present when the category has real data. */
  employees?: { total: number; active: number; newThisMonth: number };
  approvals?: { leavePending: number; otPending: number; payrollPending: number };
  payrollMonth?: { month: string; netTotal: string; totalEarnings: string; totalDeductions: string };
  contracts?: { expiringIn30Days: number };
  /** V316 — every category with real widgets shares the {@code kpi}
   *  key on the wire. Each bundle reads only the fields it knows
   *  about; the union keeps TS from complaining while surfaces
   *  coexist. */
  kpi?: {
    // POS
    todaySales?:     number | string;
    todayOrders?:    number;
    avgOrderValue?:  number | string;
    todayCustomers?: number;
    todayDiscount?:  number | string;
    // Accounting (MTD, USD-normalized)
    revenueMtd?: number | string;
    expenseMtd?: number | string;
    profitMtd?:  number | string;
    arOpen?:     number | string;
    apOpen?:     number | string;
    // Payroll (MTD)
    netMtd?:         number | string;
    earningsMtd?:    number | string;
    deductionsMtd?:  number | string;
    avgSalary?:      number | string;
    employeesMtd?:   number;
    paidBatchesMtd?: number;
    pendingBatches?: number;
    // Management roll-up (composed from the other services)
    payrollNetMtd?:  number | string;
    employees?:      number;
    // School
    activeStudents?:     number;
    totalStudents?:      number;
    newEnrollmentsMtd?:  number;
    completed?:          number;
    withdrawn?:          number;
    // Hospital
    encountersToday?:    number;
    encountersMtd?:      number;
    appointmentsToday?:  number;
    pending?:            number;
  };
  /** Per-category trend rows. */
  trend?:
    | { date: string; sales: number | string; orders: number }[]
    | { month: string; revenue: number | string; expense: number | string; profit: number | string }[]
    | { month: string; net: number | string; earnings: number | string; deductions: number | string }[]
    | { month: string; enrollments: number }[]
    | { month: string; encounters: number }[];
  /** POS-only. */
  recentOrders?: {
    id: string;
    queueNo: string;
    customerName: string;
    currency: string;
    total: number | string;
    paymentMethod: string;
    checkedOutAt: string | null;
  }[];
  /** Accounting-only. Positive amountUsd = revenue; negative = expense. */
  recentTransactions?: {
    id: string;
    kind: 'invoice' | 'bill';
    docNo: string;
    issueDate: string;
    amountUsd: number | string;
    currency: string;
    status: string;
  }[];
  /** Payroll-only. */
  recentBatches?: {
    id: string;
    subject: string;
    type: string;
    monthYear: string;
    batchDate: string | null;
    employees: number;
    status: string;
    netSalaryTotal: number | string;
    currency: string;
  }[];
  /** Management-only. Merged feed of accounting / payroll / POS
   *  rows. Positive amountUsd = money in; negative = money out.
   *  {@code source} + {@code kind} let the FE colour + icon the row. */
  activity?: {
    id: string;
    source: 'accounting' | 'payroll' | 'pos';
    kind?: string;
    docNo: string;
    date: string | null;
    status: string;
    amountUsd: number | string;
  }[];
  /** School-only. */
  recentEnrollments?: {
    id: string;
    enrollmentNo: string;
    status: string;
    enrollmentDate: string | null;
    studentId: string | null;
  }[];
  /** Hospital-only. */
  recentEncounters?: {
    id: string;
    encounterNo: string;
    status: string;
    encounterDate: string | null;
    patientId: string | null;
  }[];
  [k: string]: unknown;
}

export function isComingSoon(s: DashboardSummary | null | undefined): boolean {
  return !!s && s.status === 'coming_soon';
}

export async function listCategories(): Promise<DashboardCategory[]> {
  return apiJson('/api/v1/dashboard/categories');
}

export async function getCategorySummary(code: string): Promise<DashboardSummary> {
  return apiJson(`/api/v1/dashboard/${encodeURIComponent(code)}`);
}
