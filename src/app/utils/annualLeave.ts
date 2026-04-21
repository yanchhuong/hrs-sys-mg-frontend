/**
 * Annual Leave (AL) quota rule + per-year per-employee allocations.
 *
 * Rule model: tenure-based tiers. For each employee the rule picks the tier
 * whose `[minYears, maxYears]` range contains the employee's years of service
 * at the rule run date, and emits `daysPerYear` as that employee's AL quota.
 *
 * "Once per year" semantics: calling `applyRuleForYear(year, employees)`
 * stores a value per employee in localStorage keyed by year. Subsequent calls
 * for the same (employee, year) do not overwrite unless `force: true` is set,
 * so accidental re-runs never reset mid-year.
 *
 * In a real backend this becomes a single `employee_annual_leave` table with
 * PRIMARY KEY (employee_id, year) — storage here is a faithful stand-in.
 */

export interface ALTier {
  /** inclusive lower bound, in whole years of tenure */
  minYears: number;
  /** exclusive upper bound; null = open-ended */
  maxYears: number | null;
  /** AL days granted for this tier */
  daysPerYear: number;
}

export interface ALValueRecord {
  employeeId: string;
  year: number;
  totalAL: number;
  setAt: string;        // ISO timestamp of when the value was recorded
  ruleSignature: string; // hash of the rule at apply time, for audit
}

const RULE_KEY = 'hrms:al:rule';
const VALUES_KEY = (year: number) => `hrms:al:values:${year}`;

// Pragmatic default tiers — adjust freely in UI.
export const DEFAULT_RULE: ALTier[] = [
  { minYears: 0,  maxYears: 1,    daysPerYear: 12 },
  { minYears: 1,  maxYears: 3,    daysPerYear: 15 },
  { minYears: 3,  maxYears: 5,    daysPerYear: 18 },
  { minYears: 5,  maxYears: null, daysPerYear: 21 },
];

export function loadRule(): ALTier[] {
  try {
    const raw = localStorage.getItem(RULE_KEY);
    if (!raw) return DEFAULT_RULE;
    const parsed = JSON.parse(raw) as ALTier[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RULE;
  } catch {
    return DEFAULT_RULE;
  }
}

export function saveRule(tiers: ALTier[]): void {
  localStorage.setItem(RULE_KEY, JSON.stringify(tiers));
}

export function ruleSignature(tiers: ALTier[]): string {
  return tiers
    .map(t => `${t.minYears}-${t.maxYears ?? '*'}:${t.daysPerYear}`)
    .join('|');
}

/** Years of service at `asOf`. Partial years don't round up. */
export function tenureYears(joinDate: string | Date, asOf: Date): number {
  const join = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  let years = asOf.getFullYear() - join.getFullYear();
  const m = asOf.getMonth() - join.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < join.getDate())) years -= 1;
  return Math.max(0, years);
}

export function daysForTenure(tiers: ALTier[], years: number): number {
  for (const tier of tiers) {
    const upper = tier.maxYears === null ? Infinity : tier.maxYears;
    if (years >= tier.minYears && years < upper) return tier.daysPerYear;
  }
  // Fallback: last tier or 0
  return tiers[tiers.length - 1]?.daysPerYear ?? 0;
}

// ---------------------------------------------------------------------------
// Per-year storage
// ---------------------------------------------------------------------------
export function loadValuesForYear(year: number): Record<string, ALValueRecord> {
  try {
    const raw = localStorage.getItem(VALUES_KEY(year));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ALValueRecord>;
  } catch {
    return {};
  }
}

function saveValuesForYear(year: number, map: Record<string, ALValueRecord>): void {
  localStorage.setItem(VALUES_KEY(year), JSON.stringify(map));
}

export interface ApplyResult {
  updated: number;
  skipped: number;   // already had a value and force=false
  total: number;
}

interface EmployeeLike {
  id: string;
  joinDate: string;
  status?: string;
}

export function applyRuleForYear(
  year: number,
  employees: EmployeeLike[],
  options: { force?: boolean; asOf?: Date } = {},
): ApplyResult {
  const rule = loadRule();
  const sig = ruleSignature(rule);
  const asOf = options.asOf ?? new Date(year, 0, 1);
  const values = loadValuesForYear(year);

  let updated = 0;
  let skipped = 0;

  for (const emp of employees) {
    if (emp.status && emp.status !== 'active') continue;
    if (new Date(emp.joinDate) > asOf) continue; // not yet joined at rule date
    if (values[emp.id] && !options.force) {
      skipped++;
      continue;
    }
    const years = tenureYears(emp.joinDate, asOf);
    values[emp.id] = {
      employeeId: emp.id,
      year,
      totalAL: daysForTenure(rule, years),
      setAt: new Date().toISOString(),
      ruleSignature: sig,
    };
    updated++;
  }

  saveValuesForYear(year, values);
  return { updated, skipped, total: employees.length };
}

/** Look up a single employee's AL for a given year. */
export function getStoredAL(employeeId: string, year: number): number | null {
  const rec = loadValuesForYear(year)[employeeId];
  return rec ? rec.totalAL : null;
}

/** Override a single employee's AL (e.g. manual adjustment). */
export function setEmployeeAL(employeeId: string, year: number, totalAL: number): void {
  const values = loadValuesForYear(year);
  values[employeeId] = {
    employeeId,
    year,
    totalAL,
    setAt: new Date().toISOString(),
    ruleSignature: 'manual-override',
  };
  saveValuesForYear(year, values);
}

export function resetYear(year: number): void {
  localStorage.removeItem(VALUES_KEY(year));
}
