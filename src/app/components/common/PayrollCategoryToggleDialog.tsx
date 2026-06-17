import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import * as categoriesApi from '../../api/payrollCategories';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional callback fired after a successful save so the parent
   *  page can refetch / refresh anything that depends on the enabled
   *  category set (e.g. next-generated payslip's line items). */
  onSaved?: () => void;
}

/** Tab keys map 1:1 to the Salary Type tokens the backend stores
 *  (V113). Adding a fourth type means adding it here + the SQL
 *  CHECK / service allowlist. */
const SALARY_TABS: { key: categoriesApi.SalaryTypeToken; label: string }[] = [
  { key: '1st',     label: '1st Salary' },
  { key: '2nd',     label: '2nd Salary' },
  { key: 'onetime', label: 'One Time Salary' },
];

/**
 * Lightweight on/off popup for the Payroll page's gear icon. The
 * three-tab layout (1st / 2nd / One Time Salary) lets HR enable a
 * given earning or deduction for one batch type without affecting
 * the others — e.g. Seniority on 1st Salary, off on the rest.
 *
 * <p>State is held as a per-category Set of enabled tokens. On Save
 * we diff against the open-time snapshot and PATCH only the rows
 * whose set actually changed, so an idle close is a no-op.</p>
 */
export function PayrollCategoryToggleDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [draft, setDraft]     = useState<categoriesApi.PayrollCategory[]>([]);
  const [activeTab, setActiveTab] = useState<categoriesApi.SalaryTypeToken>('1st');
  // Snapshot of each row's enabledSalaryTypes on open so the save
  // step only PATCHes categories whose set actually changed.
  const [original, setOriginal] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    categoriesApi.list()
      .then(rows => {
        if (cancelled) return;
        setDraft(rows);
        // Compare by sorted CSV — order-independent equality check.
        const snap = new Map(rows.map(r => [r.id, [...r.enabledSalaryTypes].sort().join(',')]));
        setOriginal(snap);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load categories'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  /** Flip the active tab's salary-type token on/off for one category.
   *  Pure on the draft array — no API call until Save. */
  const toggleForActive = (id: string, on: boolean) => {
    setDraft(prev => prev.map(c => {
      if (c.id !== id) return c;
      const set = new Set(c.enabledSalaryTypes);
      if (on) set.add(activeTab); else set.delete(activeTab);
      // Preserve the tab order from SALARY_TABS so the saved CSV is
      // deterministic (1st,2nd,onetime), not insertion-order.
      const next = SALARY_TABS.map(t => t.key).filter(k => set.has(k));
      return { ...c, enabledSalaryTypes: next };
    }));
  };

  // Visibility filter (V114) — a category renders only on tabs that
  // sit in its applicableSalaryTypes set. This is what hides the
  // "1st Salary" earning from the 2nd / One Time tabs and the "1st
  // Salary" deduction from the 1st / One Time tabs.
  const visible = draft.filter(c => c.applicableSalaryTypes.includes(activeTab));
  const earnings   = visible.filter(c => c.kind === 'earning').sort((a, b) => a.order - b.order);
  const deductions = visible.filter(c => c.kind === 'deduction').sort((a, b) => a.order - b.order);

  const handleSave = async () => {
    const changed = draft.filter(c =>
      original.get(c.id) !== [...c.enabledSalaryTypes].sort().join(','));
    if (changed.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(changed.map(c =>
        categoriesApi.update(c.id, { enabledSalaryTypes: c.enabledSalaryTypes })));
      toast.success(`Updated ${changed.length} categor${changed.length === 1 ? 'y' : 'ies'}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const renderColumn = (
    title: string,
    icon: React.ReactNode,
    rows: categoriesApi.PayrollCategory[],
    extraInfoRows?: { label: string; hint: string }[],
  ) => {
    const activeCount = rows.filter(r => r.enabledSalaryTypes.includes(activeTab)).length;
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-[11px] text-gray-400">
            ({activeCount}/{rows.length} on)
          </span>
        </div>
        <div className="space-y-1">
          {/* Read-only info rows that ride above the toggleable
           *  categories — e.g. Basic + Position Allowance on the
           *  One Time Salary tab. These come from the employee
           *  record directly and aren't toggleable, so they render
           *  as a muted line + an italic "from Employee" caption
           *  instead of a switch. */}
          {extraInfoRows?.map(r => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-gray-50/60"
            >
              <div className="text-sm text-gray-700">
                {r.label}
                <span className="ml-1.5 text-[10px] text-gray-400 italic">{r.hint}</span>
              </div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">auto</span>
            </div>
          ))}
          {rows.length === 0 && !extraInfoRows?.length && (
            <p className="text-xs text-gray-400 italic">No {title.toLowerCase()} configured.</p>
          )}
          {rows.map(c => {
            const on = c.enabledSalaryTypes.includes(activeTab);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50"
              >
                <Label
                  htmlFor={`tog_${c.id}`}
                  className={`text-sm flex-1 cursor-pointer ${on ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  {c.label}
                  {c.system && (
                    <span className="ml-1.5 text-[10px] text-gray-400">system</span>
                  )}
                </Label>
                <Switch
                  id={`tog_${c.id}`}
                  checked={on}
                  onCheckedChange={v => toggleForActive(c.id, v)}
                  disabled={loading || saving}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payroll Settings</DialogTitle>
          <DialogDescription>
            Choose which earnings + deductions appear on each Salary Type batch.
            Switch tabs to configure each type independently.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as categoriesApi.SalaryTypeToken)}>
          <TabsList className="grid grid-cols-3 w-full">
            {SALARY_TABS.map(t => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 py-2">
            {renderColumn(
              'Earnings',
              <TrendingUp className="h-4 w-4 text-emerald-600" />,
              earnings,
              // One Time Salary always pays out the full Basic +
              // Position Allowance from the employee record — these
              // aren't toggleable categories, but HR needs to see
              // them so the tab doesn't look like it's missing the
              // base pay. Listed before the dynamic categories so
              // the reading order matches a real payslip.
              activeTab === 'onetime'
                ? [
                    { label: 'Basic',              hint: 'from Employee' },
                    { label: 'Position Allowance', hint: 'from Employee' },
                  ]
                : undefined,
            )}
            {renderColumn(
              'Deductions',
              <TrendingDown className="h-4 w-4 text-rose-600" />,
              deductions,
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
