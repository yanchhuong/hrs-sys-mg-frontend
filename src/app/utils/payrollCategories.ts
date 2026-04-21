import { PayrollCategory, PayrollCategoryKind } from '../types/settings';

const STORAGE_KEY = 'hrms:payrollCategories';

// Built-in seed — mirrors the currently hardcoded AS-IS layout so upgrading
// users see the exact same payroll columns they had before the customization
// feature landed. `system: true` rows can be renamed/disabled/reordered but
// not deleted, so the excel parser's fixed column indices keep resolving.
export const DEFAULT_EARNINGS: Omit<PayrollCategory, 'id'>[] = [
  { code: 'basic',      label: 'Basic',      kind: 'earning', valueType: 'flat', defaultAmount: 0, order: 1, enabled: true, system: true },
  { code: 'position',   label: 'Position',   kind: 'earning', valueType: 'flat', defaultAmount: 0, order: 2, enabled: true, system: true },
  { code: 'ot',         label: 'OT',         kind: 'earning', valueType: 'flat', defaultAmount: 0, order: 3, enabled: true, system: true },
  { code: 'allowances', label: 'Allowances', kind: 'earning', valueType: 'flat', defaultAmount: 0, order: 4, enabled: true, system: true },
  { code: 'bonus',      label: 'Bonus',      kind: 'earning', valueType: 'flat', defaultAmount: 0, order: 5, enabled: true, system: true },
];

export const DEFAULT_DEDUCTIONS: Omit<PayrollCategory, 'id'>[] = [
  { code: 'tax',     label: 'Tax',     kind: 'deduction', valueType: 'flat', defaultAmount: 0, order: 1, enabled: true, system: true },
  { code: 'advance', label: 'Advance', kind: 'deduction', valueType: 'flat', defaultAmount: 0, order: 2, enabled: true, system: true },
  { code: 'loan',    label: 'Loan',    kind: 'deduction', valueType: 'flat', defaultAmount: 0, order: 3, enabled: true, system: true },
  { code: 'nssf',    label: 'NSSF',    kind: 'deduction', valueType: 'flat', defaultAmount: 0, order: 4, enabled: true, system: true },
  { code: 'others',  label: 'Others',  kind: 'deduction', valueType: 'flat', defaultAmount: 0, order: 5, enabled: true, system: true },
];

function makeId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function withIds(seed: Omit<PayrollCategory, 'id'>[]): PayrollCategory[] {
  return seed.map((c) => ({ ...c, id: makeId() }));
}

function getDefaults(): PayrollCategory[] {
  return [...withIds(DEFAULT_EARNINGS), ...withIds(DEFAULT_DEDUCTIONS)];
}

export function loadPayrollCategories(): PayrollCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = getDefaults();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as PayrollCategory[];
    if (!Array.isArray(parsed)) throw new Error('corrupt');
    return parsed;
  } catch {
    const seeded = getDefaults();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

export function savePayrollCategories(categories: PayrollCategory[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function resetPayrollCategories(): PayrollCategory[] {
  const seeded = getDefaults();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function createCategory(kind: PayrollCategoryKind, existing: PayrollCategory[]): PayrollCategory {
  const maxOrder = existing
    .filter((c) => c.kind === kind)
    .reduce((m, c) => Math.max(m, c.order), 0);
  return {
    id: makeId(),
    code: '',
    label: '',
    kind,
    valueType: 'flat',
    defaultAmount: 0,
    order: maxOrder + 1,
    enabled: true,
    system: false,
  };
}

/** Code must be unique within its kind, and restricted to code-safe chars. */
export function validateCategory(
  draft: PayrollCategory,
  all: PayrollCategory[],
): string | null {
  if (!draft.label.trim()) return 'Label is required';
  if (!draft.code.trim()) return 'Code is required';
  if (!/^[a-z][a-z0-9_]*$/.test(draft.code)) return 'Code must be lowercase letters, digits, underscore; starting with a letter';
  const clash = all.find(
    (c) => c.id !== draft.id && c.kind === draft.kind && c.code === draft.code,
  );
  if (clash) return `Code "${draft.code}" already exists in ${draft.kind}s`;
  return null;
}
