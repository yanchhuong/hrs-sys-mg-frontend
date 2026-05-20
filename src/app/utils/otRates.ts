/**
 * OT rate helpers — keep the Overtime page, Payroll generator and any
 * Excel template that needs to estimate OT pay all reading the same math.
 *
 * Night-work rule (V58 / Cambodian Labour Law Art. 144 + 162):
 *   if any portion of [reqStart, reqEnd) overlaps [nightStart, nightEnd)
 *   AND the night-work toggle is on, the night rate REPLACES the day-
 *   type rate for that segment. When the toggle is off (or no overlap),
 *   the day-type rate stands alone. The night rate is the canonical
 *   "this is night work" pay — it doesn't compose multiplicatively or
 *   floor against weekend / holiday rates.
 *
 * Both intervals here are open-on-the-right and treat the end-time as
 * exclusive so a window of 22:00 → 05:00 correctly wraps past midnight.
 */

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(s => Number(s) || 0);
  return h * 60 + m;
}

/**
 * Split a [start, end) interval into one or two non-wrapping intervals
 * so overlap checks don't have to special-case midnight wrap. When end
 * is at or before start, the window is assumed to wrap (e.g. 22:00 → 05:00
 * yields [22:00, 24:00) and [00:00, 05:00)).
 */
function splitWindow(startMin: number, endMin: number): Array<[number, number]> {
  if (endMin > startMin) return [[startMin, endMin]];
  if (endMin === startMin) return []; // zero-length → no coverage
  return [[startMin, 24 * 60], [0, endMin]];
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Returns true when the OT request's [startHour, endHour) interval
 * touches any part of the configured night window. Missing start/end
 * (rows filed before V20 added the hour-range labels) → false; the
 * caller falls back to the day-type rate, which is the safe direction.
 */
export function otOverlapsNightWindow(
  reqStartHour: string | undefined | null,
  reqEndHour: string | undefined | null,
  nightStart: string,
  nightEnd: string,
): boolean {
  if (!reqStartHour || !reqEndHour) return false;
  const reqIntervals = splitWindow(toMin(reqStartHour), toMin(reqEndHour));
  if (reqIntervals.length === 0) return false;
  const nightIntervals = splitWindow(toMin(nightStart), toMin(nightEnd));
  if (nightIntervals.length === 0) return false;
  return reqIntervals.some(r => nightIntervals.some(n => intervalsOverlap(r, n)));
}

export type NightComposeMode = 'replace' | 'max' | 'multiply';

/**
 * Resolves the effective hourly multiplier for an OT request. When the
 * picked hours overlap the night window AND the night-work toggle is
 * on, the {@code nightCompose} mode (V61) decides how the two rates
 * combine:
 *
 *   - 'replace'  → night rate wins outright (default; matches HR's
 *                   intuition that the Settings row IS the rate for
 *                   night hours).
 *   - 'max'      → max(dayTypeRate, nightRate). Night acts as a floor
 *                   without ever lowering weekend / holiday pay.
 *   - 'multiply' → dayTypeRate × nightRate. Compound model
 *                   (Saturday 23:00 → 2 × 1.3 = 2.6×).
 *
 * Outside the night window — or when nightEnabled is false — the day-
 * type rate stands alone.
 */
export function effectiveOtMultiplier(args: {
  dayTypeRate: number;
  nightEnabled: boolean;
  nightRate: number;
  isNight: boolean;
  /** Tenant-configurable composition mode. Defaults to 'replace'. */
  nightCompose?: NightComposeMode;
}): number {
  const { dayTypeRate, nightEnabled, nightRate, isNight, nightCompose = 'replace' } = args;
  if (!nightEnabled || !isNight) return dayTypeRate;
  switch (nightCompose) {
    case 'max':      return Math.max(dayTypeRate, nightRate);
    case 'multiply': return dayTypeRate * nightRate;
    case 'replace':
    default:         return nightRate;
  }
}

// ---------------------------------------------------------------------------
// Cross-date OT (V59) — split by day, apply per-day day-type
// ---------------------------------------------------------------------------
//
// A night shift filed as `date=Fri 22:00 → endDate=Sat 05:00` splits into
// two same-day buckets at midnight. Each bucket picks its own day-type
// rate from the calendar; the night rule still applies on each bucket
// independently — Saturday 00:00–05:00 is inside the night window, so
// its effective rate is the night rate (replacing the weekend rate for
// those hours).
//
// `splitOtRequestByDay` does the bucketing; `computeOtPay` walks the
// buckets and returns the total $ amount. Same-day OT collapses to a
// single bucket so existing callers don't pay a complexity tax.

/** One side of a (possibly) split OT request. End-of-day boundary uses the
 *  literal string '24:00' so the night-overlap check still treats it as
 *  the end of the calendar day. */
export interface OtSegment {
  /** YYYY-MM-DD. */
  date: string;
  /** HH:mm. */
  startHour: string;
  /** HH:mm or '24:00' for the end-of-day boundary on the first bucket. */
  endHour: string;
  /** Hours covered by this segment. */
  hours: number;
}

function diffHours(startHHmm: string, endHHmm: string): number {
  const [sh, sm] = startHHmm.split(':').map(n => Number(n) || 0);
  const [eh, em] = endHHmm.split(':').map(n => Number(n) || 0);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

/**
 * Split a (possibly cross-date) OT request at midnight so each bucket has
 * its own calendar date for day-type detection. Two-day OT only — a span
 * longer than ~24h is unusual in practice and gets collapsed to the
 * start-day bucket (caller can flag the row for HR review separately).
 */
export function splitOtRequestByDay(args: {
  startDate: string;
  startHour: string;
  endDate: string;
  endHour: string;
  /** Total hours, used as a fallback when start/end hours are missing
   *  (legacy rows pre-V20 lack them) so the calculator still returns a
   *  sensible non-zero number. */
  totalHours: number;
}): OtSegment[] {
  const { startDate, startHour, endDate, endHour, totalHours } = args;

  // Missing hour labels → one bucket on startDate carrying the row's
  // total hours. Same answer as the legacy single-rate path.
  if (!startHour || !endHour) {
    return [{ date: startDate, startHour: '00:00', endHour: '24:00', hours: totalHours }];
  }

  // Same calendar day → one bucket. Trust the request's startHour/endHour
  // when they straddle midnight (endHour <= startHour but endDate ==
  // startDate is a data error we tolerate by falling back to totalHours).
  if (!endDate || endDate === startDate) {
    const h = diffHours(startHour, endHour);
    return [{ date: startDate, startHour, endHour, hours: h > 0 ? h : totalHours }];
  }

  // Cross-date — split at midnight. The first bucket runs to the literal
  // '24:00' so the night-overlap helper still hits its [22:00, 24:00)
  // sub-interval; the second starts at '00:00'.
  const hoursFirst  = diffHours(startHour, '24:00');
  const hoursSecond = diffHours('00:00', endHour);
  return [
    { date: startDate, startHour, endHour: '24:00', hours: hoursFirst },
    { date: endDate,   startHour: '00:00', endHour, hours: hoursSecond },
  ];
}

/**
 * Day-of-week weekend check — Saturday + Sunday by default. Accepts a
 * YYYY-MM-DD string; returns false on parse failure so a malformed row
 * doesn't accidentally double its pay.
 */
export function isDateWeekend(yyyymmdd: string): boolean {
  const d = new Date(yyyymmdd + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  return dow === 0 || dow === 6;
}

/**
 * Total OT pay for a (possibly cross-date) request. Each daily bucket
 * picks its own day-type rate, then the night overlay raises it to
 * max(dayTypeRate, nightRate) when the bucket's hours overlap the
 * configured window.
 *
 * `dayTypeRateFor` is supplied by the caller so the holiday-vs-weekday
 * distinction can be driven by whatever source they trust (the OT row's
 * isHoliday flag, a holiday-calendar lookup, etc.). For the common case
 * pass `defaultDayTypeRateFor` below.
 */
export function computeOtPay(args: {
  hourlyWage: number;
  segments: OtSegment[];
  dayTypeRateFor: (segment: OtSegment) => number;
  nightEnabled: boolean;
  nightRate: number;
  nightStart: string;
  nightEnd: string;
  nightCompose?: NightComposeMode;
  /** Admin-only manual rate override (V62). When > 0, every bucket
   *  pays this rate — day-type + night composition are skipped. */
  rateOverride?: number | null;
}): number {
  const {
    hourlyWage, segments, dayTypeRateFor,
    nightEnabled, nightRate, nightStart, nightEnd, nightCompose,
    rateOverride,
  } = args;
  if (!hourlyWage) return 0;
  const hasOverride = typeof rateOverride === 'number' && rateOverride > 0;
  let total = 0;
  for (const seg of segments) {
    if (!seg.hours) continue;
    let rate: number;
    if (hasOverride) {
      rate = rateOverride!;
    } else {
      const dayRate = dayTypeRateFor(seg);
      const isNight = otOverlapsNightWindow(seg.startHour, seg.endHour, nightStart, nightEnd);
      rate = effectiveOtMultiplier({
        dayTypeRate: dayRate,
        nightEnabled,
        nightRate,
        isNight,
        nightCompose,
      });
    }
    total += hourlyWage * seg.hours * rate;
  }
  return total;
}

/**
 * The common dayTypeRateFor: weekday rate by default, weekend rate when
 * the segment's date is Sat/Sun, holiday rate when the caller-supplied
 * holiday-date set contains the segment's date.
 */
export function defaultDayTypeRateFor(args: {
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
  holidayDates?: ReadonlySet<string>;
}): (segment: OtSegment) => number {
  const { weekdayRate, weekendRate, holidayRate, holidayDates } = args;
  return (segment) => {
    if (holidayDates?.has(segment.date)) return holidayRate;
    if (isDateWeekend(segment.date)) return weekendRate;
    return weekdayRate;
  };
}

// ---------------------------------------------------------------------------
// Rule-type detection — drives the "Workday / Weekend / Holiday + Night"
// badge on the Apply OT and Request OT dialogs.
// ---------------------------------------------------------------------------

export type OtDayType = 'workday' | 'weekend' | 'holiday';

export interface DetectedOtRule {
  dayType: OtDayType;
  isNight: boolean;
  effectiveRate: number;
  /** True when the effective rate came from an explicit admin override
   *  rather than the day-type + night composition. */
  fromOverride: boolean;
  /** Human-readable summary, e.g. "Weekend + Night → 2.0x". */
  label: string;
}

/**
 * Resolve the day-type + night overlay + effective rate for an OT
 * request. Centralises the badge logic so the Apply OT (Edit Attendance)
 * and Request OT (Overtime page) dialogs render the same answer.
 *
 * The caller can pass {@code override} (= the admin's pick) to force a
 * specific day-type regardless of what the date implies; otherwise day-
 * type is derived from the explicit isHoliday flag, then a holiday-date
 * set, then day-of-week (Sat/Sun = weekend), falling back to workday.
 */
export function detectOtRule(args: {
  date: string;
  startHour?: string;
  endHour?: string;
  isHoliday?: boolean;
  holidayDates?: ReadonlySet<string>;
  weekdayRate: number;
  weekendRate: number;
  holidayRate: number;
  nightEnabled: boolean;
  nightRate: number;
  nightStart: string;
  nightEnd: string;
  nightCompose?: NightComposeMode;
  /** Admin override — when set, wins over auto-detection. */
  override?: OtDayType;
  /** Admin-only manual rate override (V62). When a positive number is
   *  supplied, bypasses day-type + night composition entirely and uses
   *  this as the effective rate. */
  rateOverride?: number | null;
}): DetectedOtRule {
  const {
    date, startHour, endHour, isHoliday, holidayDates,
    weekdayRate, weekendRate, holidayRate,
    nightEnabled, nightRate, nightStart, nightEnd, nightCompose, override,
    rateOverride,
  } = args;

  let dayType: OtDayType;
  if (override) {
    dayType = override;
  } else if (isHoliday || holidayDates?.has(date)) {
    dayType = 'holiday';
  } else if (isDateWeekend(date)) {
    dayType = 'weekend';
  } else {
    dayType = 'workday';
  }

  const dayTypeRate =
    dayType === 'holiday' ? holidayRate :
    dayType === 'weekend' ? weekendRate :
    weekdayRate;

  const isNight = otOverlapsNightWindow(startHour, endHour, nightStart, nightEnd);
  const computedRate = effectiveOtMultiplier({
    dayTypeRate, nightEnabled, nightRate, isNight, nightCompose,
  });
  const hasOverride = typeof rateOverride === 'number' && rateOverride > 0;
  const effectiveRate = hasOverride ? rateOverride! : computedRate;

  const dayLabel = dayType === 'holiday' ? 'Holiday' : dayType === 'weekend' ? 'Weekend' : 'Workday';
  const label = hasOverride
    ? `Custom → ${effectiveRate}x`
    : `${dayLabel}${nightEnabled && isNight ? ' + Night' : ''} → ${effectiveRate}x`;

  return { dayType, isNight, effectiveRate, fromOverride: hasOverride, label };
}
