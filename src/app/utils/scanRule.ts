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
 * Persistence: single tenant rule, {@code localStorage} key {@code hrms:scanRule}.
 */

const STORAGE_KEY = 'hrms:scanRule';

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

export function loadScanRule(): ScanRule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCAN_RULE;
    const parsed = JSON.parse(raw) as Partial<ScanRule>;
    return { ...DEFAULT_SCAN_RULE, ...parsed };
  } catch {
    return DEFAULT_SCAN_RULE;
  }
}

export function saveScanRule(rule: Omit<ScanRule, 'updatedAt'>): ScanRule {
  const next: ScanRule = { ...rule, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
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
