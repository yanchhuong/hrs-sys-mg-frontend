/**
 * OT rate helpers — keep the Overtime page, Payroll generator and any
 * Excel template that needs to estimate OT pay all reading the same math.
 *
 * The night-work overlay (V58 / Cambodian Labour Law Art. 144 + 162):
 *   if any portion of [reqStart, reqEnd) overlaps [nightStart, nightEnd),
 *   the effective rate is max(dayTypeRate, nightRate) — single rate, not
 *   multiplicative. When the night toggle is off, the day-type rate
 *   stands alone.
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

/**
 * Resolves the effective hourly multiplier for an OT request, layering
 * the night-work overlay on top of the day-type rate. Higher-of-two
 * semantics — see file-level docstring for the rationale.
 */
export function effectiveOtMultiplier(args: {
  dayTypeRate: number;
  nightEnabled: boolean;
  nightRate: number;
  isNight: boolean;
}): number {
  const { dayTypeRate, nightEnabled, nightRate, isNight } = args;
  if (!nightEnabled || !isNight) return dayTypeRate;
  return Math.max(dayTypeRate, nightRate);
}
