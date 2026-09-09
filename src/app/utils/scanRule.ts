/**
 * Scan Rule — tells the attendance evaluator how many daily punches the
 * company expects and what the target times are for each.
 *
 *   `two`  — one check-in in the morning and one check-out in the evening.
 *   `four` — morning in/out + afternoon in/out.
 *
 * Per-employee flex schedules are handled on the Employee record (not here):
 * point an employee at a different set of {@link ScanRule} values if they
 * work different hours.
 *
 * Persistence: the tenant's AttendanceRule row, via
 * /api/v1/settings/attendance-rules.
 *
 * This used to save to localStorage, which meant the SERVER never saw
 * the rule — attendance_rules had zero rows for every tenant, so
 * AttendanceSelfCheckInService#activeRule returned null and both
 * statusForCheckIn and statusForCheckOut answered "present" for any
 * pair of times. Late and early-leave detection could not fire at all.
 *
 * The localStorage key is still READ once, to migrate whatever an admin
 * had configured on this device up to the server. See
 * {@link legacyLocalRule}.
 */

import * as settingsApi from '../api/settings';

const STORAGE_KEY = 'hrms:scanRule';
const RULE_NAME = 'Default';

export type ScanMode = 'two' | 'four';

export interface ScanRule {
  mode: ScanMode;
  /** Morning check-in target (both modes). */
  morningIn: string;
  /** Lunch-out target; 4-scan only. */
  morningOut: string;
  /** Lunch-return target; 4-scan only. */
  afternoonIn: string;
  /** Evening check-out target (both modes). */
  eveningOut: string;
  /** Grace minutes AFTER the IN target that still count as on-time. */
  graceInMinutes: number;
  /** Grace minutes BEFORE the OUT target that still count as on-time. */
  graceOutMinutes: number;
  /** 2-scan: half-day leave skips the absent half. */
  halfDayCountsAsHalfScan: boolean;
  updatedAt: string;
}

export const DEFAULT_SCAN_RULE: ScanRule = {
  mode: 'two',
  morningIn:  '08:00',
  morningOut: '12:00',
  afternoonIn:'13:00',
  eveningOut: '17:00',
  graceInMinutes: 0,
  graceOutMinutes: 0,
  halfDayCountsAsHalfScan: true,
  updatedAt: new Date().toISOString(),
};

/** The device-local rule an admin configured before this moved
 *  server-side. Returns null when there's nothing to migrate. */
function legacyLocalRule(): ScanRule | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_SCAN_RULE, ...(JSON.parse(raw) as Partial<ScanRule>) };
  } catch {
    return null;
  }
}

/** Pick the rule the ENGINE will use, so the UI shows the same one it
 *  classifies against: the active rule, else the first.
 *  Mirrors AttendanceSelfCheckInService#activeRule. */
function pickEngineRule(rules: settingsApi.AttendanceRule[]): settingsApi.AttendanceRule | null {
  if (!rules.length) return null;
  return rules.find(r => r.isActive) ?? rules[0];
}

const hhmm = (t: string | undefined, fallback: string): string =>
  t ? t.slice(0, 5) : fallback;   // server sends HH:mm:ss

/** AttendanceRule (server) → ScanRule (UI).
 *
 *  The lunch pair maps onto breakTime: morningOut is when the break
 *  starts, afternoonIn when it ends. That's the same window
 *  computeWorkHours() deducts, so the two stay consistent. */
export function toScanRule(r: settingsApi.AttendanceRule): ScanRule {
  return {
    mode: r.scanMode === 'four' ? 'four' : 'two',
    morningIn:   hhmm(r.standardCheckIn,  DEFAULT_SCAN_RULE.morningIn),
    morningOut:  hhmm(r.breakTime?.startTime, DEFAULT_SCAN_RULE.morningOut),
    afternoonIn: hhmm(r.breakTime?.endTime,   DEFAULT_SCAN_RULE.afternoonIn),
    eveningOut:  hhmm(r.standardCheckOut, DEFAULT_SCAN_RULE.eveningOut),
    graceInMinutes:  r.lateThresholdMinutes ?? 0,
    graceOutMinutes: r.graceOutMinutes ?? 0,
    halfDayCountsAsHalfScan: r.halfDayCountsAsHalfScan ?? true,
    updatedAt: new Date().toISOString(),
  };
}

/** ScanRule (UI) → the create/update body.
 *
 *  graceInMinutes becomes lateThresholdMinutes — that IS the grace the
 *  engine applies in statusForCheckIn (target + threshold = cutoff).
 *
 *  breakTime.autoDeduct is always true: computeWorkHours() spans the
 *  day's first-in to last-out, so the lunch window has to come off in
 *  BOTH modes. (4-scan doesn't yet sum per-interval — that needs the
 *  attendance_punch table.) */
function toRuleBody(rule: ScanRule): Omit<settingsApi.AttendanceRule, 'id'> {
  return {
    name: RULE_NAME,
    mode: rule.mode,
    scanMode: rule.mode,
    standardCheckIn:  rule.morningIn,
    standardCheckOut: rule.eveningOut,
    morningOut:  rule.morningOut,
    afternoonIn: rule.afternoonIn,
    lateThresholdMinutes: rule.graceInMinutes,
    graceInMinutes:  rule.graceInMinutes,
    graceOutMinutes: rule.graceOutMinutes,
    halfDayCountsAsHalfScan: rule.halfDayCountsAsHalfScan,
    otCalculationMode: 'auto',
    isActive: true,
    breakTime: {
      startTime: rule.morningOut,
      endTime:   rule.afternoonIn,
      autoDeduct: true,
    },
    // Required hours. Derived from the configured span minus the break
    // so a 08:00–17:00 day with a 1h lunch asks for 8h, not 9h — the
    // engine compares worked hours against this.
    minimumWorkHours: requiredHoursFor(rule),
    allowMultiplePunch: rule.mode === 'four',
    earlyLeaveEnabled: true,
    autoMarkAbsent: true,
  };
}

const minutesOf = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** Paid hours implied by the scan rule: total span minus the lunch
 *  window. Clamped at 0 so an inverted configuration can't produce a
 *  negative requirement that every day would satisfy. */
export function requiredHoursFor(rule: ScanRule): number {
  const span = minutesOf(rule.eveningOut) - minutesOf(rule.morningIn);
  const brk = Math.max(0, minutesOf(rule.afternoonIn) - minutesOf(rule.morningOut));
  return Math.max(0, Math.round(((span - brk) / 60) * 100) / 100);
}

/** Read the tenant's rule. Falls back to any device-local legacy rule,
 *  then to the defaults — so the UI never renders blank. */
export async function fetchScanRule(): Promise<{ rule: ScanRule; ruleId: string | null }> {
  const existing = pickEngineRule(await settingsApi.listAttendanceRules());
  if (existing) return { rule: toScanRule(existing), ruleId: existing.id };
  return { rule: legacyLocalRule() ?? DEFAULT_SCAN_RULE, ruleId: null };
}

/** Persist to the server. Creates the tenant's rule on first save,
 *  patches it afterwards. Clears the legacy local copy on success so
 *  the stale device value can't shadow the server one later. */
export async function persistScanRule(
  rule: Omit<ScanRule, 'updatedAt'>,
  ruleId: string | null,
): Promise<{ rule: ScanRule; ruleId: string }> {
  const body = toRuleBody({ ...rule, updatedAt: new Date().toISOString() });
  const saved = ruleId
    ? await settingsApi.updateAttendanceRule(ruleId, body)
    : await settingsApi.createAttendanceRule(body);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  return { rule: toScanRule(saved), ruleId: saved.id };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export type SessionVerdict =
  | 'on_time'
  | 'late_in'
  | 'early_out'
  | 'late_and_early'
  | 'no_in'
  | 'no_out'
  | 'missing';

export interface EvaluatedSession {
  label: string;
  expectedIn: string;
  expectedOut: string;
  actualIn?: string;
  actualOut?: string;
  verdict: SessionVerdict;
}

export interface DayPunches {
  morningIn?: string;
  morningOut?: string;
  afternoonIn?: string;
  afternoonOut?: string;
  /** Approved half-day leave (2-scan mode only). */
  halfLeave?: 'morning' | 'afternoon' | null;
}

export function evaluate(rule: ScanRule, punches: DayPunches): EvaluatedSession[] {
  if (rule.mode === 'two') {
    const inSource  = punches.morningIn   ?? punches.afternoonIn;
    const outSource = punches.afternoonOut ?? punches.morningOut;

    if (rule.halfDayCountsAsHalfScan && punches.halfLeave) {
      if (punches.halfLeave === 'morning') {
        return [buildSession('Afternoon (half)', rule.afternoonIn, rule.eveningOut,
          punches.afternoonIn, punches.afternoonOut ?? outSource, rule)];
      }
      return [buildSession('Morning (half)', rule.morningIn, rule.morningOut,
        punches.morningIn ?? inSource, punches.morningOut, rule)];
    }
    return [buildSession('Day', rule.morningIn, rule.eveningOut, inSource, outSource, rule)];
  }
  return [
    buildSession('Morning',   rule.morningIn,   rule.morningOut,  punches.morningIn,   punches.morningOut,   rule),
    buildSession('Afternoon', rule.afternoonIn, rule.eveningOut,  punches.afternoonIn, punches.afternoonOut, rule),
  ];
}

function buildSession(
  label: string,
  expectedIn: string,
  expectedOut: string,
  actualIn: string | undefined,
  actualOut: string | undefined,
  rule: ScanRule,
): EvaluatedSession {
  return {
    label, expectedIn, expectedOut, actualIn, actualOut,
    verdict: scoreSession(expectedIn, expectedOut, actualIn, actualOut, rule),
  };
}

function scoreSession(
  expectedIn: string,
  expectedOut: string,
  actualIn: string | undefined,
  actualOut: string | undefined,
  rule: ScanRule,
): SessionVerdict {
  const hasIn  = isValidTime(actualIn);
  const hasOut = isValidTime(actualOut);
  if (!hasIn && !hasOut) return 'missing';
  if (!hasIn) return 'no_in';
  if (!hasOut) return 'no_out';
  const lateIn   = toMinutes(actualIn!)  > toMinutes(expectedIn)  + rule.graceInMinutes;
  const earlyOut = toMinutes(actualOut!) < toMinutes(expectedOut) - rule.graceOutMinutes;
  if (lateIn && earlyOut) return 'late_and_early';
  if (lateIn)             return 'late_in';
  if (earlyOut)           return 'early_out';
  return 'on_time';
}

function isValidTime(t?: string): boolean {
  return !!t && /^\d{1,2}:\d{2}$/.test(t);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function previewScenarios(mode: ScanMode): { label: string; punches: DayPunches }[] {
  if (mode === 'two') {
    return [
      { label: 'On-time day',   punches: { morningIn: '07:55', afternoonOut: '17:05' } },
      { label: 'Late arrival',  punches: { morningIn: '08:15', afternoonOut: '17:03' } },
      { label: 'Early leave',   punches: { morningIn: '07:58', afternoonOut: '16:40' } },
      { label: 'Half-day (AM)', punches: { afternoonIn: '13:02', afternoonOut: '17:05', halfLeave: 'morning' } },
    ];
  }
  return [
    { label: 'On-time day',         punches: { morningIn: '07:55', morningOut: '12:02', afternoonIn: '12:58', afternoonOut: '17:04' } },
    { label: 'Late lunch return',   punches: { morningIn: '07:59', morningOut: '12:05', afternoonIn: '13:10', afternoonOut: '17:00' } },
    { label: 'Missing evening out', punches: { morningIn: '08:00', morningOut: '12:02', afternoonIn: '13:00' } },
  ];
}
