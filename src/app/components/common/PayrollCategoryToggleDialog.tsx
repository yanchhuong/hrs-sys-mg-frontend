import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Eye, TrendingUp, TrendingDown, Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as categoriesApi from '../../api/payrollCategories';
import * as settingsApi from '../../api/accountingSettings';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional callback fired after a successful save so the parent
   *  page can refetch / refresh anything that depends on the enabled
   *  category set (e.g. next-generated payslip's line items). */
  onSaved?: () => void;
  /** Optional callback fired after the Display-section settings save
   *  so the parent page can pick up the new {@code showApproval}
   *  value without a page reload. */
  onSettingsSaved?: (next: settingsApi.AccountingSettings) => void;
}

/** Tab keys map 1:1 to the Salary Type tokens the backend stores
 *  (V113). Adding a fourth type means adding it here + the SQL
 *  CHECK / service allowlist. */
const SALARY_TABS: { key: categoriesApi.SalaryTypeToken; label: string }[] = [
  { key: '1st',     label: '1st Salary' },
  { key: '2nd',     label: '2nd Salary' },
  { key: 'onetime', label: 'One Time Salary' },
];

type Section = 'display' | 'categories';

const MENU: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'display',    label: 'Display',
    hint: 'What shows on the form',
    icon: <Eye className="h-4 w-4" /> },
  { key: 'categories', label: 'Earnings & Deductions',
    hint: 'Which categories appear on each Salary Type',
    icon: <TrendingUp className="h-4 w-4" /> },
];

/**
 * Payroll settings — a two-section left-menu popup:
 *
 *  - Display        → Show Approval toggle (V175). Off by default;
 *                     when on, the New Payroll Batch dialog exposes
 *                     the Approvers picker.
 *  - Categories     → Per-Salary-Type Earning / Deduction toggles
 *                     (V113/V114). Retains the three-tab shape.
 *
 * <p>State is held as a per-category Set of enabled tokens. On Save
 * we diff against the open-time snapshot and PATCH only the rows
 * whose set actually changed, so an idle close is a no-op.</p>
 */
export function PayrollCategoryToggleDialog({ open, onOpenChange, onSaved, onSettingsSaved }: Props) {
  const [section, setSection] = useState<Section>('display');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [draft, setDraft]     = useState<categoriesApi.PayrollCategory[]>([]);
  const [activeTab, setActiveTab] = useState<categoriesApi.SalaryTypeToken>('1st');
  // Snapshot of each row's enabledSalaryTypes on open so the save
  // step only PATCHes categories whose set actually changed.
  const [original, setOriginal] = useState<Map<string, string>>(new Map());
  // Display-tab settings — piggy-back on accounting_settings via
  // scope='payroll' so the {@code show_approval} column can be shared.
  const [settings, setSettings] = useState<settingsApi.AccountingSettings>(
    settingsApi.defaultsFor('payroll'));
  const [settingsOriginal, setSettingsOriginal] = useState<settingsApi.AccountingSettings>(
    settingsApi.defaultsFor('payroll'));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSection('display');
    Promise.all([
      categoriesApi.list(),
      settingsApi.get('payroll').catch(() => settingsApi.defaultsFor('payroll')),
    ])
      .then(([rows, s]) => {
        if (cancelled) return;
        setDraft(rows);
        const snap = new Map(rows.map(r => [r.id, [...r.enabledSalaryTypes].sort().join(',')]));
        setOriginal(snap);
        setSettings(s);
        setSettingsOriginal(s);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load settings'))
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
  // sit in its applicableSalaryTypes set.
  const visible = draft.filter(c => c.applicableSalaryTypes.includes(activeTab));
  const earnings   = visible.filter(c => c.kind === 'earning').sort((a, b) => a.order - b.order);
  const deductions = visible.filter(c => c.kind === 'deduction').sort((a, b) => a.order - b.order);

  const handleSave = async () => {
    const changedCats = draft.filter(c =>
      original.get(c.id) !== [...c.enabledSalaryTypes].sort().join(','));
    const settingsChanged =
      settings.showApproval !== settingsOriginal.showApproval
      || settings.approverCount !== settingsOriginal.approverCount;
    if (changedCats.length === 0 && !settingsChanged) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      if (settingsChanged) {
        const saved = await settingsApi.update('payroll', settings);
        setSettings(saved);
        setSettingsOriginal(saved);
        onSettingsSaved?.(saved);
      }
      if (changedCats.length > 0) {
        await Promise.all(changedCats.map(c =>
          categoriesApi.update(c.id, { enabledSalaryTypes: c.enabledSalaryTypes })));
      }
      const msg =
        settingsChanged && changedCats.length > 0
          ? `Saved display + ${changedCats.length} categor${changedCats.length === 1 ? 'y' : 'ies'}`
          : settingsChanged
            ? 'Display settings saved'
            : `Updated ${changedCats.length} categor${changedCats.length === 1 ? 'y' : 'ies'}`;
      toast.success(msg);
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
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-1.5">
            Payroll Settings
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Payroll Settings description"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Configure what shows on Payroll forms and which categories appear on each Salary Type.
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          {/* DialogDescription kept sr-only for a11y — Radix warns
              when a DialogContent has no description. */}
          <DialogDescription className="sr-only">
            Configure what shows on Payroll forms and which categories appear on each Salary Type.
          </DialogDescription>
        </DialogHeader>

        {/* Two-pane layout: left menu, right content. Matches the
            Accounting Settings dialog so users trained on Quotation
            / Voucher settings feel at home. */}
        <div className="grid grid-cols-[220px_1fr] border-t min-h-[380px]">
          <aside className="bg-gray-50/60 border-r p-2">
            {/* v-settings-menu-tooltip — hint on hover, labels stay single-line. */}
            <TooltipProvider delayDuration={200}>
              {MENU.map(m => {
                const active = section === m.key;
                return (
                  <Tooltip key={m.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSection(m.key)}
                        className={`w-full text-left rounded-md px-2.5 py-2 mb-0.5 transition-colors flex items-center gap-2 ${
                          active ? 'bg-white shadow-sm text-blue-700' : 'text-gray-700 hover:bg-white'
                        }`}
                      >
                        <span className={active ? 'text-blue-600' : 'text-gray-500'}>{m.icon}</span>
                        <span className="flex-1 min-w-0 text-sm font-medium truncate">{m.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      {m.hint}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </aside>

          <div className="overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
              </div>
            ) : section === 'display' ? (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold mb-1">Display</h3>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                  <div className="flex-1">
                    <Label htmlFor="tog_showApproval" className="text-sm font-medium cursor-pointer">
                      Show Approver(s)
                    </Label>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Show the Approvers picker on the New Payroll Batch dialog so a batch can be
                      routed for sign-off (manual-assign chain). Off by default — leave off to skip
                      approval entirely (batch lands as auto-approved).
                    </p>
                  </div>
                  <Switch
                    id="tog_showApproval"
                    checked={settings.showApproval}
                    onCheckedChange={v => setSettings({ ...settings, showApproval: v })}
                    disabled={saving}
                  />
                </div>
                {/* Slot-count selector — only meaningful when the
                    toggle is on. Inset so the pair reads as one
                    setting. V180. */}
                {settings.showApproval && (
                  <div className="flex items-center justify-between gap-2 pl-6 pr-2 py-1.5">
                    <Label className="text-xs text-gray-600">
                      Number of approvers
                    </Label>
                    <Select
                      value={String(settings.approverCount ?? 3)}
                      onValueChange={(v) => setSettings({ ...settings, approverCount: Number(v) })}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              // Earning & Deduction — retains the three-tab shape from
              // the previous popup so muscle memory carries over.
              <div className="space-y-3">
                <Tabs value={activeTab} onValueChange={v => setActiveTab(v as categoriesApi.SalaryTypeToken)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    {SALARY_TABS.map(t => (
                      <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="grid grid-cols-2 gap-6 py-1">
                  {renderColumn(
                    'Earnings',
                    <TrendingUp className="h-4 w-4 text-emerald-600" />,
                    earnings,
                    // 2nd Salary + One Time Salary carry three
                    // Employee-record earnings that aren't toggleable
                    // categories — render them as muted info rows so
                    // HR sees the tab isn't missing base pay.
                    activeTab === '2nd' || activeTab === 'onetime'
                      ? [
                          { label: 'Basic Salary',         hint: 'from Employee' },
                          { label: 'Position Allowance',   hint: 'from Employee' },
                          { label: 'Evaluation Allowance', hint: 'from Employee' },
                        ]
                      : undefined,
                  )}
                  {renderColumn(
                    'Deductions',
                    <TrendingDown className="h-4 w-4 text-rose-600" />,
                    deductions,
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
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
