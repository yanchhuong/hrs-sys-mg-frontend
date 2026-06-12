import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as categoriesApi from '../../api/payrollCategories';
import { USE_MOCKS } from '../../api/client';
import {
  ArrowDown,
  ArrowUp,
  Check,
  DollarSign,
  Info,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../context/AuthContext';
import {
  PayrollCategory,
  PayrollCategoryKind,
  PayrollCategoryValueType,
} from '../../types/settings';
import {
  createCategory,
  loadPayrollCategories,
  resetPayrollCategories,
  savePayrollCategories,
  validateCategory,
} from '../../utils/payrollCategories';

/**
 * Per-category hover-hint, keyed by `code`. Only categories with non-obvious
 * mechanics need an entry. Adding a new key here is the entire extension
 * point; the table cell surfaces an ℹ button next to the label whenever
 * a code matches.
 *
 * Each entry is rendered inside a <Tooltip>, so plain text + brief JSX
 * (lists, code spans) are fine — keep it short, deep details belong in
 * the dedicated feature dialog (e.g. SeniorityIndemnityDialog).
 */
const CATEGORY_HELP: Record<string, React.ReactNode> = {
  seniority_indemnity: (
    <div className="space-y-1.5">
      <p className="font-semibold">Seniority — Cambodian Labour Law (2018 Prakas)</p>
      <p>
        Paid <strong>twice a year</strong> to UDC (Permanent) employees:
        <br />• <strong>7.5 days in June</strong> (covers Jan–Jun)
        <br />• <strong>7.5 days in December</strong> (covers Jul–Dec)
      </p>
      <p>
        Wage base = <strong>average net salary</strong> across the
        6 months of payroll (skipping <em>1st Salary</em> advances).
      </p>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1">
        amount = (avg_net ÷ working_days) × days
      </p>
      <p>
        <strong>working_days</strong> is derived from your tenant's General Attendance
        Settings &gt; Weekend Days: Mon–Sat → 26, Mon–Fri → 22, Mon–Thu → 17.
      </p>
      <p>
        FDC employees aren't eligible — they receive a separate <strong>5% Severance</strong>
        at contract end. Payments ≤ 4,000,000 KHR are tax-exempt (Circular 002).
      </p>
      <p className="text-[11px] opacity-80">
        Use the <strong>Calculate Seniority</strong> button on the Payroll page
        to generate the batch.
      </p>
    </div>
  ),
  fdc_severance: (
    <div className="space-y-1.5">
      <p className="font-semibold">5% Severance — Cambodian Labour Law (FDC expiry)</p>
      <p>
        Paid <strong>once</strong>, on the natural expiry of a Fixed
        Duration Contract (FDC). Equals at least <strong>5%</strong> of
        the total wages the employee earned over the contract's
        lifetime.
      </p>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1">
        severance = total_wages × 5%
      </p>
      <p>
        Wage base = sum of <em>total_earnings</em> across every month the
        contract was active (gross, includes OT and allowances). The
        rate can be raised per batch in the dialog if HR's policy is
        more generous; the legal minimum is 5%.
      </p>
      <p>
        <strong>Forfeited</strong> when the contract ends for serious
        misconduct (the calculator excludes those rows automatically
        when you've set <em>Termination Reason = Misconduct</em> on the
        Contract).
      </p>
      <p>
        UDC employees aren't eligible — they receive the twice-yearly
        <strong> Seniority</strong> indemnity instead. Never compound the two.
      </p>
      <p className="text-[11px] opacity-80">
        Use the <strong>Calculate 5% Severance</strong> button on the Payroll page
        to generate the batch.
      </p>
    </div>
  ),
  first_salary: (
    <div className="space-y-1.5">
      <p className="font-semibold">1st Salary — mid-month advance (split-pay)</p>
      <p>
        Used by tenants that pay twice a month. The amount is a
        <strong> formula</strong>, not a fixed number HR enters:
      </p>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1">
        first_salary = (Basic Salary + Position Allowance + Evaluation Allowance) ÷ 2
      </p>
      <p>
        On a <strong>1st Salary</strong> payroll batch it appears as the
        only earning line. On the matching <strong>2nd Salary</strong>
        batch the same amount is added as a <em>deduction</em> so the
        employee only takes home the remaining half.
      </p>
      <p className="text-[11px] opacity-80">
        Default Amount is ignored — leave it at 0; the payroll generator
        fills the value per employee from the formula.
      </p>
    </div>
  ),
  tax: (
    <div className="space-y-1.5">
      <p className="font-semibold">Tax on Salary (TOS) — Cambodia</p>
      <p>
        Progressive monthly tax published by NBC, applied to the
        employee's gross in KHR after dependent deductions
        (<strong>150,000 KHR per dependent</strong>; spouse + children
        when <em>marital_status = married</em>).
      </p>
      <p className="text-[11px]">Monthly brackets (KHR):</p>
      <table className="text-[11px] w-full border-separate border-spacing-y-0.5">
        <tbody>
          <tr><td className="opacity-80">0 – 1,500,000</td><td className="text-right">0%</td></tr>
          <tr><td className="opacity-80">1,500,001 – 2,000,000</td><td className="text-right">5%</td></tr>
          <tr><td className="opacity-80">2,000,001 – 8,500,000</td><td className="text-right">10%</td></tr>
          <tr><td className="opacity-80">8,500,001 – 12,500,000</td><td className="text-right">15%</td></tr>
          <tr><td className="opacity-80">Over 12,500,000</td><td className="text-right">20%</td></tr>
        </tbody>
      </table>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1 whitespace-pre-wrap">
{`taxableKhr = (gross × khrPerUsd) − dependents × 150,000
taxKhr     = (taxableKhr × ratePercent ÷ 100) − excessAmount
taxUsd     = taxKhr ÷ khrPerUsd`}
      </p>
      <p className="text-[11px]">
        The <strong>excess</strong> column on the Tax Brackets table
        encodes lower-bracket subtotals so a single multiplication on
        the gross gives the correct progressive amount.
      </p>
      <p className="text-[11px] opacity-80">
        Brackets + FX rate are editable under Settings →
        <strong> Tax Brackets</strong>. Auto-filled by the payroll
        generator; a manual non-zero value on a salary_deductions row
        wins over the formula.
      </p>
    </div>
  ),
  ot: (
    <div className="space-y-1.5">
      <p className="font-semibold">OT — Cambodia Labour Law overtime</p>
      <p>
        Hourly wage is derived from the employee's Basic + Position +
        Evaluation Allowance and the configured working days:
      </p>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1 whitespace-pre-wrap">
{`hourly_wage = (basic + position + evaluation) ÷ (working_days × 8)
ot_pay      = hourly_wage × hours × rate_multiplier`}
      </p>
      <p className="text-[11px]">Default multipliers (editable per tenant):</p>
      <table className="text-[11px] w-full border-separate border-spacing-y-0.5">
        <tbody>
          <tr><td className="opacity-80">Weekday (after work hours)</td><td className="text-right">1.50×</td></tr>
          <tr><td className="opacity-80">Weekend (Sat / Sun off)</td><td className="text-right">2.00×</td></tr>
          <tr><td className="opacity-80">Public Holiday</td><td className="text-right">2.50×</td></tr>
        </tbody>
      </table>
      <p className="text-[11px]">
        Hours flow in from <strong>approved OT requests</strong> grouped
        by day-type for the month — pending / rejected rows are ignored.
        A custom Department / Group rate in Settings → OT overrides the
        tenant defaults for matched employees.
      </p>
      <p className="text-[11px] opacity-80">
        Default Amount on this row is ignored — leave it at 0. The
        payroll generator fills the per-employee value from the formula
        above; a manual non-zero on the payslip line wins over it.
      </p>
    </div>
  ),
  nssf: (
    <div className="space-y-1.5">
      <p className="font-semibold">NSSF Pension — employee 2% contribution (Cambodia)</p>
      <p>
        Cambodian NSSF taxes the <strong>contributory wage</strong>,
        which is the employee's monthly gross capped at
        <strong> 1,200,000 KHR</strong> (≈ $300 USD). The employee pays
        <strong> 2%</strong> of that during the first 5 years of the
        pension scheme.
      </p>
      <p className="font-mono text-[11px] bg-black/20 rounded px-2 py-1 whitespace-pre-wrap">
{`contributoryKhr = min(gross × khrPerUsd, 1,200,000)
nssfKhr         = contributoryKhr × 0.02
nssfUsd         = nssfKhr ÷ khrPerUsd`}
      </p>
      <p className="text-[11px]">
        <strong>Worked example</strong> — khrPerUsd = 4,000, gross ≥ $300:
        <br />min($1,950 × 4,000, 1,200,000) = 1,200,000
        <br />× 2% = 24,000 KHR ÷ 4,000 = <strong>$6.00</strong>
      </p>
      <p className="text-[11px] opacity-80">
        Auto-filled by the payroll generator; the row's Default Amount
        is ignored. A manual non-zero value on a salary_deductions row
        for the employee wins over the formula. The 5-year pension
        escalation (2% → 8%) is <em>not yet modelled</em>.
      </p>
    </div>
  ),
};

function adaptApi(c: categoriesApi.PayrollCategory): PayrollCategory {
  return {
    id: c.id,
    code: c.code,
    label: c.label,
    kind: c.kind,
    valueType: c.valueType,
    defaultAmount: c.defaultAmount,
    order: (c as unknown as { displayOrder?: number }).displayOrder ?? c.order ?? 0,
    enabled: c.enabled,
    system: (c as unknown as { isSystem?: boolean }).isSystem ?? c.system ?? false,
  };
}

export function PayrollCategorySettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [categories, setCategories] = useState<PayrollCategory[]>(() =>
    USE_MOCKS ? loadPayrollCategories() : [],
  );
  const [, setLoading] = useState<boolean>(!USE_MOCKS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PayrollCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PayrollCategory | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // Dialog state for the "Add Category" popup. `null` → closed.
  const [addDraft, setAddDraft] = useState<PayrollCategory | null>(null);

  const loadCategories = async () => {
    if (USE_MOCKS) {
      setCategories(loadPayrollCategories());
      return;
    }
    setLoading(true);
    try {
      // apiJson resolves undefined when the tenant has this module
      // disabled (TenantModuleGuard returns 403 { code: 'ModuleDisabled' }).
      // Default to empty so the page renders blank instead of
      // crashing on `.map`. Happens transiently after the admin
      // uninstalls a related module via the Apps launcher.
      const res = await categoriesApi.list();
      setCategories((res ?? []).map(adaptApi));
    } catch (err) {
      toast.error(`Failed to load payroll categories: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const earnings = useMemo(
    () => categories.filter((c) => c.kind === 'earning').sort((a, b) => a.order - b.order),
    [categories],
  );
  const deductions = useMemo(
    () => categories.filter((c) => c.kind === 'deduction').sort((a, b) => a.order - b.order),
    [categories],
  );

  // ---- mutations ---------------------------------------------------------
  const persistLocal = (next: PayrollCategory[]) => {
    setCategories(next);
    savePayrollCategories(next);
  };

  // Opens the Add Category popup pre-seeded for the given kind.
  const startAdd = (kind: PayrollCategoryKind) => {
    setAddDraft(createCategory(kind, categories));
  };

  const cancelAdd = () => setAddDraft(null);

  const saveAddDraft = async () => {
    if (!addDraft) return;
    if (!addDraft.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!addDraft.code.trim()) {
      toast.error('Code is required');
      return;
    }
    const err = validateCategory(addDraft, categories);
    if (err) {
      toast.error(err);
      return;
    }
    if (USE_MOCKS) {
      persistLocal([...categories, addDraft]);
      setAddDraft(null);
      toast.success(`Added "${addDraft.label}"`);
      return;
    }
    try {
      await categoriesApi.create({
        code: addDraft.code,
        label: addDraft.label,
        kind: addDraft.kind,
        valueType: addDraft.valueType,
        defaultAmount: addDraft.defaultAmount,
        order: addDraft.order,
        enabled: addDraft.enabled,
      });
      await loadCategories();
      setAddDraft(null);
      toast.success(`Added "${addDraft.label}"`);
    } catch (e) {
      toast.error(`Failed to add category: ${(e as Error).message}`);
    }
  };

  const startEdit = (c: PayrollCategory) => {
    setDraft({ ...c });
    setEditingId(c.id);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingId(null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const err = validateCategory(draft, categories);
    if (err) {
      toast.error(err);
      return;
    }
    const exists = categories.some((c) => c.id === draft.id);
    if (USE_MOCKS) {
      const next = exists
        ? categories.map((c) => (c.id === draft.id ? draft : c))
        : [...categories, draft];
      persistLocal(next);
      setDraft(null);
      setEditingId(null);
      toast.success(exists ? 'Category updated' : 'Category added');
      return;
    }
    try {
      if (exists) {
        await categoriesApi.update(draft.id, {
          code: draft.code,
          label: draft.label,
          kind: draft.kind,
          valueType: draft.valueType,
          defaultAmount: draft.defaultAmount,
          order: draft.order,
          enabled: draft.enabled,
        });
      } else {
        await categoriesApi.create({
          code: draft.code,
          label: draft.label,
          kind: draft.kind,
          valueType: draft.valueType,
          defaultAmount: draft.defaultAmount,
          order: draft.order,
          enabled: draft.enabled,
        });
      }
      await loadCategories();
      setDraft(null);
      setEditingId(null);
      toast.success(exists ? 'Category updated' : 'Category added');
    } catch (e) {
      toast.error(`Failed to save category: ${(e as Error).message}`);
    }
  };

  const toggleEnabled = async (c: PayrollCategory) => {
    if (USE_MOCKS) {
      persistLocal(
        categories.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)),
      );
      return;
    }
    try {
      await categoriesApi.update(c.id, { enabled: !c.enabled });
      await loadCategories();
    } catch (e) {
      toast.error(`Failed to update category: ${(e as Error).message}`);
    }
  };

  const deleteCategory = async (c: PayrollCategory) => {
    if (USE_MOCKS) {
      persistLocal(categories.filter((x) => x.id !== c.id));
      toast.success(`Removed "${c.label}"`);
      setConfirmDelete(null);
      return;
    }
    try {
      await categoriesApi.remove(c.id);
      await loadCategories();
      toast.success(`Removed "${c.label}"`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(`Failed to delete category: ${(e as Error).message}`);
    }
  };

  const move = async (c: PayrollCategory, dir: -1 | 1) => {
    const siblings = categories
      .filter((x) => x.kind === c.kind)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((x) => x.id === c.id);
    const swapWith = siblings[idx + dir];
    if (!swapWith) return;
    if (USE_MOCKS) {
      const next = categories.map((x) => {
        if (x.id === c.id) return { ...x, order: swapWith.order };
        if (x.id === swapWith.id) return { ...x, order: c.order };
        return x;
      });
      persistLocal(next);
      return;
    }
    // Build new ordered id list across the affected kind, swapping c and swapWith.
    const reordered = [...siblings];
    reordered[idx] = swapWith;
    reordered[idx + dir] = c;
    // Include all categories (other kind preserved in their existing order) so
    // the backend gets a complete ordering payload.
    const otherKind = categories
      .filter((x) => x.kind !== c.kind)
      .sort((a, b) => a.order - b.order);
    const ids = [...reordered, ...otherKind].map((x) => x.id);
    try {
      await categoriesApi.reorder(ids);
      await loadCategories();
    } catch (e) {
      toast.error(`Failed to reorder categories: ${(e as Error).message}`);
    }
  };

  const doReset = async () => {
    if (USE_MOCKS) {
      const seeded = resetPayrollCategories();
      setCategories(seeded);
      setConfirmReset(false);
      cancelEdit();
      toast.success('Restored default categories');
      return;
    }
    try {
      const restored = await categoriesApi.restoreDefaults();
      setCategories(restored.map(adaptApi));
      setConfirmReset(false);
      cancelEdit();
      toast.success('Restored default categories');
    } catch (e) {
      toast.error(`Failed to restore defaults: ${(e as Error).message}`);
    }
  };

  // ---- render ------------------------------------------------------------
  const renderSection = (kind: PayrollCategoryKind, rows: PayrollCategory[]) => {
    const isEarning = kind === 'earning';
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isEarning ? (
                <DollarSign className="h-5 w-5 text-emerald-600" />
              ) : (
                <Minus className="h-5 w-5 text-rose-600" />
              )}
              {isEarning ? t('payrollCat.earnings') : t('payrollCat.deductions')}
              <Badge variant="secondary">{rows.length}</Badge>
            </CardTitle>
            <CardDescription>
              {isEarning ? t('payrollCat.earnings.desc') : t('payrollCat.deductions.desc')}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => startAdd(kind)} disabled={!!editingId}>
              <Plus className="mr-1 h-4 w-4" />
              {t('payrollCat.add')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">{t('payrollCat.col.order')}</TableHead>
                <TableHead>{t('payrollCat.col.label')}</TableHead>
                <TableHead>{t('payrollCat.col.code')}</TableHead>
                <TableHead className="w-[140px]">{t('payrollCat.col.type')}</TableHead>
                <TableHead className="w-[140px]">{t('payrollCat.col.default')}</TableHead>
                <TableHead className="w-[100px]">{t('payrollCat.col.enabled')}</TableHead>
                {isAdmin && <TableHead className="w-[180px] text-right">{t('payrollCat.col.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && editingId === null && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-gray-500 py-8">
                    {t('payrollCat.empty')}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c, idx) => {
                const isEditing = editingId === c.id;
                return (
                  <TableRow key={c.id} className={c.enabled ? '' : 'opacity-50'}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === 0 || !!editingId || !isAdmin}
                          onClick={() => move(c, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === rows.length - 1 || !!editingId || !isAdmin}
                          onClick={() => move(c, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>

                    {isEditing && draft ? (
                      <>
                        <TableCell>
                          <Input
                            autoFocus
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                            placeholder="e.g. Transport Allowance"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={draft.code}
                            onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase() })}
                            placeholder="transport_allowance"
                            disabled={draft.system}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={draft.valueType}
                            onValueChange={(v: PayrollCategoryValueType) =>
                              setDraft({ ...draft, valueType: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flat">{t('payrollCat.type.flat')}</SelectItem>
                              <SelectItem value="percentage">{t('payrollCat.type.percentage')}</SelectItem>
                              <SelectItem value="day">Day</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.5"
                            value={draft.defaultAmount}
                            onChange={(e) =>
                              setDraft({ ...draft, defaultAmount: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={draft.enabled}
                            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={saveDraft}>
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <span className="font-medium">{c.label}</span>
                          {c.system && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {t('payrollCat.builtin')}
                            </Badge>
                          )}
                          {CATEGORY_HELP[c.code] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 align-middle"
                                  aria-label={`How ${c.label} works`}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-sm text-left text-xs leading-relaxed">
                                {CATEGORY_HELP[c.code]}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.code}</code>
                        </TableCell>
                        <TableCell>
                          {c.valueType === 'flat'
                            ? t('payrollCat.type.flat')
                            : c.valueType === 'percentage'
                              ? t('payrollCat.type.percentage')
                              : 'Day'}
                        </TableCell>
                        <TableCell>
                          {c.valueType === 'percentage'
                            ? `${c.defaultAmount}%`
                            : c.valueType === 'day'
                              ? `${c.defaultAmount} days`
                              : c.defaultAmount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={c.enabled}
                            onCheckedChange={() => toggleEnabled(c)}
                            disabled={!isAdmin || !!editingId}
                          />
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => startEdit(c)}
                              disabled={!!editingId}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDelete(c)}
                              disabled={c.system || !!editingId}
                              title={c.system ? t('payrollCat.cannotDelete') : ''}
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </TableCell>
                        )}
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('payrollCat.title')}</h1>
          <p className="text-gray-500">{t('payrollCat.description')}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('payrollCat.reset')}
          </Button>
        )}
      </div>

      {/* Full-width tabs — Earnings and Deductions get the whole row each.
          Counts on the trigger labels so the user sees scale before clicking. */}
      <Tabs defaultValue="earning">
        <TabsList>
          <TabsTrigger value="earning" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            {t('payrollCat.earnings')}
            <Badge variant="secondary" className="ml-1">{earnings.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="deduction" className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-rose-600" />
            {t('payrollCat.deductions')}
            <Badge variant="secondary" className="ml-1">{deductions.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="earning" className="mt-4">
          {renderSection('earning', earnings)}
        </TabsContent>
        <TabsContent value="deduction" className="mt-4">
          {renderSection('deduction', deductions)}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payrollCat.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('payrollCat.delete.desc').replace('{name}', confirmDelete?.label ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => confirmDelete && deleteCategory(confirmDelete)}
            >
              {t('action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payrollCat.reset.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('payrollCat.reset.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>{t('action.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Category popup */}
      <Dialog open={!!addDraft} onOpenChange={(open) => !open && cancelAdd()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {addDraft?.kind === 'earning' ? (
                <DollarSign className="h-5 w-5 text-emerald-600" />
              ) : (
                <Minus className="h-5 w-5 text-rose-600" />
              )}
              Add {addDraft?.kind === 'earning' ? 'Earning' : 'Deduction'} Category
            </DialogTitle>
            <DialogDescription>
              Create a new payroll category. Code must be lowercase letters, digits, and underscores
              only, and unique within its kind.
            </DialogDescription>
          </DialogHeader>
          {addDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Label <span className="text-red-500">*</span>
                </Label>
                <Input
                  autoFocus
                  value={addDraft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    // Autofill code from the label while the user hasn't touched it yet.
                    const autoCode = label
                      .toLowerCase()
                      .replace(/[^a-z0-9_]+/g, '_')
                      .replace(/^_+|_+$/g, '');
                    setAddDraft({
                      ...addDraft,
                      label,
                      code: addDraft.code.trim() === '' || addDraft.code === autoPrev(addDraft.label)
                        ? autoCode
                        : addDraft.code,
                    });
                  }}
                  placeholder="e.g. Transport Allowance"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={addDraft.code}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, code: e.target.value.toLowerCase() })
                  }
                  placeholder="transport_allowance"
                />
                <p className="text-[11px] text-gray-500">
                  Stable machine key referenced by payroll items. Cannot be renamed later.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Value type</Label>
                  <Select
                    value={addDraft.valueType}
                    onValueChange={(v: PayrollCategoryValueType) =>
                      setAddDraft({ ...addDraft, valueType: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">{t('payrollCat.type.flat')}</SelectItem>
                      <SelectItem value="percentage">{t('payrollCat.type.percentage')}</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    Default {addDraft.valueType === 'percentage' ? '(%)' : addDraft.valueType === 'day' ? '(days)' : '(amount)'}
                  </Label>
                  <Input
                    type="number"
                    step={addDraft.valueType === 'day' ? '0.5' : '0.01'}
                    value={addDraft.defaultAmount}
                    onChange={(e) =>
                      setAddDraft({ ...addDraft, defaultAmount: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border bg-gray-50">
                <div>
                  <p className="text-sm font-medium">Enabled</p>
                  <p className="text-[11px] text-gray-500">
                    Disabled categories stay in the catalog but don't appear on new payroll items.
                  </p>
                </div>
                <Switch
                  checked={addDraft.enabled}
                  onCheckedChange={(v) => setAddDraft({ ...addDraft, enabled: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelAdd}>
              {t('action.cancel')}
            </Button>
            <Button onClick={saveAddDraft}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Helper used by the Add dialog to decide whether the `code` field has been
 * auto-generated from the label (and therefore should keep updating) vs.
 * manually edited (leave alone).
 */
function autoPrev(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
