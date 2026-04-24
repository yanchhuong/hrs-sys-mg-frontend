/**
 * Per-employee overrides on top of the tenant-wide {@link ScanRule}.
 *
 * When an employee works different hours than the standard schedule, we
 * store only the fields that differ. An override without a field falls back
 * to the tenant scan rule — same evaluator applies.
 *
 * Persistence: {@code localStorage['hrms:flexibleSchedules']}, array of
 * overrides keyed by {@code employeeId}.
 */

import { ScanMode, ScanRule } from './scanRule';

const STORAGE_KEY = 'hrms:flexibleSchedules';

export interface FlexibleSchedule {
  id: string;
  employeeId: string;
  /** Optional mode override — most overrides just change times, not the mode. */
  mode?: ScanMode;
  morningIn?: string;
  morningOut?: string;
  afternoonIn?: string;
  eveningOut?: string;
  graceInMinutes?: number;
  graceOutMinutes?: number;
  halfDayCountsAsHalfScan?: boolean;
  note?: string;
  updatedAt: string;
}

export type FlexibleScheduleInput = Omit<FlexibleSchedule, 'id' | 'updatedAt'>;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function readAll(): FlexibleSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: FlexibleSchedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function genId(): string {
  return `flex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listFlexibleSchedules(): FlexibleSchedule[] {
  return readAll();
}

export function getFlexibleFor(employeeId: string): FlexibleSchedule | undefined {
  return readAll().find(o => o.employeeId === employeeId);
}

/** One override per employee — creating another replaces the first. */
export function upsertFlexibleSchedule(input: FlexibleScheduleInput): FlexibleSchedule {
  const all = readAll();
  const existing = all.find(o => o.employeeId === input.employeeId);
  const now = new Date().toISOString();
  if (existing) {
    const updated: FlexibleSchedule = { ...existing, ...input, updatedAt: now };
    writeAll(all.map(o => o.id === existing.id ? updated : o));
    return updated;
  }
  const created: FlexibleSchedule = { id: genId(), updatedAt: now, ...input };
  writeAll([...all, created]);
  return created;
}

export function deleteFlexibleSchedule(id: string): void {
  writeAll(readAll().filter(o => o.id !== id));
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Return the effective scan rule for an employee: the override's fields
 * layered on top of the tenant scan rule. Fields the override doesn't set
 * fall back to the tenant value.
 */
export function resolveRuleFor(employeeId: string, scanRule: ScanRule): ScanRule {
  const override = getFlexibleFor(employeeId);
  if (!override) return scanRule;
  return {
    ...scanRule,
    mode:                    override.mode                    ?? scanRule.mode,
    morningIn:               override.morningIn               ?? scanRule.morningIn,
    morningOut:              override.morningOut              ?? scanRule.morningOut,
    afternoonIn:             override.afternoonIn             ?? scanRule.afternoonIn,
    eveningOut:              override.eveningOut              ?? scanRule.eveningOut,
    graceInMinutes:          override.graceInMinutes          ?? scanRule.graceInMinutes,
    graceOutMinutes:         override.graceOutMinutes         ?? scanRule.graceOutMinutes,
    halfDayCountsAsHalfScan: override.halfDayCountsAsHalfScan ?? scanRule.halfDayCountsAsHalfScan,
  };
}
