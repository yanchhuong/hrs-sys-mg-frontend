import { useEffect, useMemo, useState } from 'react';
import { Calculator, Download, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatMoney, formatNumber } from '../../utils/format';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

import * as settingsApi from '../../api/settings';
import * as otApi from '../../api/overtime';
import * as increasesApi from '../../api/increases';
import { USE_MOCKS } from '../../api/client';
import { Employee } from '../../types/hrms';

/**
 * Cambodia Tax on Salary (TOS) calculator dialog.
 *
 * Mirrors the UX of the Compute Seniority Indemnity dialog: pick a
 * Month-Year, see the per-employee breakdown, then close. This is a
 * REFERENCE / preview tool — the regular Salary batch upload already
 * auto-fills the Tax column from the same brackets, so HR doesn't need
 * to create a separate "Tax-only" batch. The dialog is for transparency:
 * "Why is this employee's tax $X?" can be answered without opening the
 * Excel template.
 *
 * Math runs client-side using the configured brackets + FX rate; no
 * backend call needed.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already loaded by the Payroll page — passed through to avoid a
   *  duplicate fetch when the dialog opens. */
  employees: Employee[];
  /** Configured progressive brackets + KHR/USD rate. May be null while
   *  loading; the dialog renders a "configure brackets" notice in that
   *  case. */
  taxSettings: settingsApi.PayrollTaxSettings | null;
}

function money(n: number, locale: 'usd' | 'khr' = 'usd'): string {
  // KHR uses no-decimal thousands grouping (#,###); USD uses #,###.00.
  // Both go through the shared utility so the app-wide formatting
  // convention is honoured.
  if (locale === 'khr') return `${formatNumber(n)} KHR`;
  return `$${formatMoney(n)}`;
}

/** Dependents = spouse (if married) + claimed children. Matches the
 *  payroll generator's dependentsFor() helper in Payroll.tsx.
 *
 *  V53 (`decouple`)    gates the whole claim — when false, no
 *                       dependents are subtracted on this payslip.
 *  V55 (`claimSpouse`) is the explicit spouse line. Independent of
 *                       maritalStatus so a widowed / divorced single
 *                       parent with custody keeps their children
 *                       deduction without a phantom spouse line. */
function dependentsFor(e: Employee): number {
  if (!e.decouple) return 0;
  const spouse = e.claimSpouse ? 1 : 0;
  const children = e.numberOfChildren ?? 0;
  return spouse + children;
}

interface BracketHit {
  fromAmount: number;
  toAmount?: number | null;
  ratePercent: number;
  excessAmount: number;
}

interface TaxRow {
  employee: Employee;
  /** Standing earnings components — exposed individually so HR can see
   *  the gross breakdown rather than just the total. */
  basicUsd: number;
  positionAllowanceUsd: number;
  evaluationAllowanceUsd: number;
  /** Approved OT dollars for the selected month — base ÷ 160 × 1.5 ×
   *  hours per approved OT request that lands in the month. (Workday
   *  rate; weekend/holiday boosts aren't surfaced through the FE OT
   *  API today — the projection slightly under-pays them, fine for
   *  the dialog's what-if scope.) */
  otUsd: number;
  /** Flat-dollar earning increases (bonus / meal / petrol / …) whose
   *  active window covers the selected month. */
  bonusUsd: number;
  /** Monthly gross used as the basis — basic + position + evaluation
   *  + OT + bonus. All five components are taxable per Cambodian TOS. */
  grossUsd: number;
  grossKhr: number;
  /** Dependents reduction is still applied to the taxable base (Cambodia
   *  TOS rule), but the column was removed from the table per UX
   *  feedback. Stays internal. */
  dependents: number;
  taxableKhr: number;
  bracket: BracketHit | null;
  taxKhr: number;
  taxUsd: number;
}

/** Apply the configured brackets to a taxable KHR amount. Returns the
 *  matching bracket + the resulting tax (also KHR). Returns null bracket
 *  when no row matches (e.g. negative taxable income after dependents). */
function applyBrackets(
  taxableKhr: number,
  brackets: BracketHit[],
): { bracket: BracketHit | null; taxKhr: number } {
  if (taxableKhr <= 0) return { bracket: null, taxKhr: 0 };
  const sorted = [...brackets].sort((a, b) => a.fromAmount - b.fromAmount);
  const bracket = sorted.find(b => {
    const within = taxableKhr >= b.fromAmount
      && (b.toAmount == null || taxableKhr <= b.toAmount);
    return within;
  });
  if (!bracket) return { bracket: null, taxKhr: 0 };
  const raw = (taxableKhr * bracket.ratePercent / 100) - bracket.excessAmount;
  return { bracket, taxKhr: Math.max(0, raw) };
}

export function TaxCalculatorDialog({ open, onOpenChange, employees, taxSettings }: Props) {
  const now = new Date();
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  /** Editable FX-rate override. Blank = use the configured tenant rate
   *  from {@link Props#taxSettings}. Lets HR run "what if NBC publishes
   *  4,050 next month?" scenarios without touching Settings → Tax
   *  Brackets. The override is dialog-scoped — closing the dialog
   *  doesn't persist it anywhere. */
  const configuredFx = taxSettings?.khrPerUsd ?? 0;
  const [fxOverride, setFxOverride] = useState<string>('');

  // Active employees only — terminated rows would just be zeros that
  // clutter the preview.
  const activeEmployees = useMemo(
    () => employees.filter(e => e.status === 'active'),
    [employees],
  );

  // OT and Bonus for the selected period, indexed by employee id.
  // Refetched whenever the dialog opens or month/year changes — the
  // numbers are small (one month's worth) so a fresh GET keeps the
  // dialog independent of whatever state the parent page holds.
  const [otHoursByEmp, setOtHoursByEmp]   = useState<Map<string, number>>(new Map());
  const [bonusUsdByEmp, setBonusUsdByEmp] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!open || USE_MOCKS) {
      setOtHoursByEmp(new Map());
      setBonusUsdByEmp(new Map());
      return;
    }
    const mm = month.padStart(2, '0');
    const yyyy = year.padStart(4, '0');
    if (!/^\d{2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return;
    const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
    const from = `${yyyy}-${mm}-01`;
    const to   = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    let cancelled = false;
    (async () => {
      try {
        // Pull approved OT + active flat-dollar earning increases in
        // parallel. Both are paginated APIs; we ask for a generous size
        // so a single page covers a normal tenant's monthly volume.
        const [otPage, incPage] = await Promise.all([
          otApi.list({ status: 'approved', from, to, scope: 'all', size: 500 }),
          increasesApi.list({ from, to, size: 500 }),
        ]);
        if (cancelled) return;
        // Sum approved OT hours per employee for the month.
        const ot = new Map<string, number>();
        for (const o of otPage.data ?? []) {
          if (!o.employeeId) continue;
          ot.set(o.employeeId, (ot.get(o.employeeId) ?? 0) + Number(o.hours || 0));
        }
        // Sum flat-dollar earnings whose effective window covers the
        // month. Skip percentage / day units (formulas, not flat $)
        // and skip the formula-driven `first_salary` /
        // `seniority_indemnity` types so they don't double-count.
        const bonus = new Map<string, number>();
        for (const i of incPage.data ?? []) {
          if (!i.employeeId) continue;
          if (i.unit && i.unit !== 'amount') continue;
          const code = (i.type ?? '').toLowerCase();
          if (code === 'first_salary' || code === 'seniority_indemnity') continue;
          bonus.set(i.employeeId, (bonus.get(i.employeeId) ?? 0) + Number(i.amount || 0));
        }
        setOtHoursByEmp(ot);
        setBonusUsdByEmp(bonus);
      } catch {
        if (!cancelled) {
          setOtHoursByEmp(new Map());
          setBonusUsdByEmp(new Map());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, month, year]);

  // Effective rate used by the calculation = override when present
  // (and a positive number), else the tenant's configured rate.
  const parsedOverride = Number(fxOverride);
  const fx = (fxOverride.trim() !== '' && Number.isFinite(parsedOverride) && parsedOverride > 0)
    ? parsedOverride
    : configuredFx;
  const brackets: BracketHit[] = useMemo(
    () => (taxSettings?.brackets ?? []).map(b => ({
      fromAmount: Number(b.fromAmount),
      toAmount: b.toAmount == null ? null : Number(b.toAmount),
      ratePercent: Number(b.ratePercent),
      excessAmount: Number(b.excessAmount),
    })),
    [taxSettings],
  );

  const rows: TaxRow[] = useMemo(() => {
    if (!fx || brackets.length === 0) return [];
    return activeEmployees.map(emp => {
      const apiId = (emp as { apiId?: string }).apiId ?? emp.id;
      const base = emp.baseSalary || 0;
      const pa   = (emp as { positionAllowance?: number }).positionAllowance ?? 0;
      const ea   = (emp as { evaluationAllowance?: number }).evaluationAllowance ?? 0;
      // Approved OT hours for the selected month → workday-rate dollars
      // (1.5× the hourly base). The 2×/3× weekend/holiday boost isn't
      // surfaced through the FE OT API today; the dialog under-counts
      // those rare rows on purpose to stay simple.
      const otHours = otHoursByEmp.get(apiId) ?? 0;
      const otUsd   = base > 0 && otHours > 0
        ? Math.round((base / 160) * 1.5 * otHours * 100) / 100
        : 0;
      const bonusUsd = bonusUsdByEmp.get(apiId) ?? 0;
      const grossUsd = base + pa + ea + otUsd + bonusUsd;
      const grossKhr = grossUsd * fx;
      const dependents = dependentsFor(emp);
      const taxableKhr = Math.max(0, grossKhr - dependents * 150_000);
      const { bracket, taxKhr } = applyBrackets(taxableKhr, brackets);
      const taxUsd = Math.round((taxKhr / fx) * 100) / 100;
      return {
        employee: emp,
        basicUsd: base,
        positionAllowanceUsd: pa,
        evaluationAllowanceUsd: ea,
        otUsd,
        bonusUsd,
        grossUsd, grossKhr, dependents, taxableKhr, bracket, taxKhr, taxUsd,
      };
    });
  }, [activeEmployees, brackets, fx, otHoursByEmp, bonusUsdByEmp]);

  const totalTaxUsd = rows.reduce((s, r) => s + r.taxUsd, 0);
  const periodLabel = year && month ? `${year}-${month}` : '—';
  const ready = fx > 0 && brackets.length > 0;

  /**
   * Build an .xlsx with the same shape as the on-screen table so HR can
   * archive / share the calc without screenshotting. Single sheet,
   * title banner + headers + one row per employee + a totals row. Uses
   * the same `xlsx` library other download helpers in this repo lean on.
   */
  const handleDownloadExcel = () => {
    const headers = [
      'Employee No', 'Employee Name', 'Position',
      'Basic Salary (USD)', 'Position Allowance (USD)', 'Evaluation Allowance (USD)',
      'OT (USD)', 'Bonus (USD)',
      'Gross (USD)',
      'Taxable (KHR)', 'Bracket (Rate)', 'Bracket Excess',
      'Tax (KHR)', 'Tax (USD)',
    ];
    const sheetRows: (string | number)[][] = [];
    sheetRows.push([`Cambodia Tax on Salary (TOS) — Period ${periodLabel} · FX ${fx} KHR/USD`]);
    sheetRows.push(headers);
    for (const r of rows) {
      sheetRows.push([
        r.employee.id,
        r.employee.name,
        r.employee.position ?? '',
        Number(r.basicUsd.toFixed(2)),
        Number(r.positionAllowanceUsd.toFixed(2)),
        Number(r.evaluationAllowanceUsd.toFixed(2)),
        Number(r.otUsd.toFixed(2)),
        Number(r.bonusUsd.toFixed(2)),
        Number(r.grossUsd.toFixed(2)),
        Math.round(r.taxableKhr),
        r.bracket ? `${r.bracket.ratePercent}%` : '',
        r.bracket ? r.bracket.excessAmount : 0,
        Math.round(r.taxKhr),
        Number(r.taxUsd.toFixed(2)),
      ]);
    }
    // Totals row — sum every USD column so the file is audit-friendly.
    sheetRows.push([
      'TOTAL', '', '',
      Number(rows.reduce((s, r) => s + r.basicUsd, 0).toFixed(2)),
      Number(rows.reduce((s, r) => s + r.positionAllowanceUsd, 0).toFixed(2)),
      Number(rows.reduce((s, r) => s + r.evaluationAllowanceUsd, 0).toFixed(2)),
      Number(rows.reduce((s, r) => s + r.otUsd, 0).toFixed(2)),
      Number(rows.reduce((s, r) => s + r.bonusUsd, 0).toFixed(2)),
      Number(rows.reduce((s, r) => s + r.grossUsd, 0).toFixed(2)),
      '', '', '',
      Math.round(rows.reduce((s, r) => s + r.taxKhr, 0)),
      Number(totalTaxUsd.toFixed(2)),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 12 }, // Employee No
      { wch: 26 }, // Name
      { wch: 22 }, // Position
      { wch: 14 }, // Basic Salary
      { wch: 16 }, // Position Allowance
      { wch: 18 }, // Evaluation Allowance
      { wch: 10 }, // OT
      { wch: 12 }, // Bonus
      { wch: 12 }, // Gross USD
      { wch: 14 }, // Taxable KHR
      { wch: 12 }, // Bracket
      { wch: 14 }, // Bracket Excess
      { wch: 12 }, // Tax KHR
      { wch: 12 }, // Tax USD
    ];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tax');
    XLSX.writeFile(wb, `Tax-Calculation-${periodLabel}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Widened from max-w-5xl → max-w-[95vw] (capped) so the 7-column
          tax preview table fits without horizontal scroll on standard
          displays. Tall content uses 90vh + flex-col so only the body
          scrolls vertically; header + period picker + footer stay put. */}
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Calculate Tax on Salary (TOS)
          </DialogTitle>
          <DialogDescription>
            Cambodia progressive monthly income tax. Preview each employee's tax for the selected period —
            same brackets the payroll auto-fill uses.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          {/* Period + FX-rate picker. The Rate input is editable so HR
              can simulate a new NBC publication ("what would tax look
              like at 4,050 next month?") without modifying the tenant
              settings. Leaving it blank falls back to the configured
              rate from Settings → Tax Brackets. */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Month</Label>
              <Input
                inputMode="numeric"
                maxLength={2}
                placeholder="MM"
                value={month}
                onChange={e => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                value={year}
                onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                Rate (KHR / USD)
                {fxOverride.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setFxOverride('')}
                    className="text-[10px] uppercase tracking-wide text-blue-600 hover:underline"
                  >
                    reset
                  </button>
                )}
              </Label>
              <Input
                inputMode="decimal"
                placeholder={configuredFx > 0 ? String(configuredFx) : '4000'}
                value={fxOverride}
                onChange={e => setFxOverride(e.target.value.replace(/[^\d.]/g, ''))}
              />
              {fxOverride.trim() !== '' && configuredFx > 0 && (
                <p className="text-[11px] text-amber-700">
                  Overriding configured rate ({configuredFx} KHR/USD) — dialog-only.
                </p>
              )}
            </div>
          </div>

          {/* Brackets reference */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600" />
                <p className="font-semibold text-sm">Brackets in use (per month, KHR)</p>
                <span className="text-xs text-gray-500">
                  FX rate: {fx > 0 ? `${formatNumber(fx)} KHR / USD` : 'not configured'}
                </span>
              </div>
              {ready ? (
                <table className="text-xs w-full">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-1">From</th>
                      <th className="text-left py-1">To</th>
                      <th className="text-right py-1">Rate</th>
                      <th className="text-right py-1">Excess</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brackets.map((b, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1">{formatNumber(b.fromAmount)}</td>
                        <td className="py-1">{b.toAmount == null ? 'and above' : formatNumber(b.toAmount)}</td>
                        <td className="py-1 text-right">{b.ratePercent}%</td>
                        <td className="py-1 text-right">{formatNumber(b.excessAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-amber-700">
                  Tax brackets or KHR/USD rate aren't configured yet — set them under
                  Settings → Tax Brackets first.
                </p>
              )}
              <p className="font-mono text-[11px] bg-gray-100 rounded px-2 py-1 mt-2 whitespace-pre-wrap">
{`taxableKhr = (gross × khrPerUsd) − dependents × 150,000
taxKhr     = (taxableKhr × ratePercent ÷ 100) − excessAmount
taxUsd     = taxKhr ÷ khrPerUsd`}
              </p>
              <p className="text-[11px] text-gray-500">
                Gross used = Basic Salary + Position Allowance + Evaluation Allowance.
                OT / bonus / other variable earnings differ by month and aren't in this preview;
                the payroll batch auto-fill uses the full earnings map.
              </p>
              <p className="text-[11px] text-gray-500">
                <strong>dependents</strong> = (1 if married + N children) when the employee's{' '}
                <em>Claim Dependents (TOS)</em> flag is <strong>Yes</strong>, else <strong>0</strong>.
                See the <Info className="h-3 w-3 inline -mt-0.5 text-blue-500" /> beside the Decouple column for the full rule.
              </p>
            </CardContent>
          </Card>

          {/* Per-employee preview. Header is sticky so column labels
              stay visible while HR scrolls a long employee list — no
              need for a side-scroll arrow. */}
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-gray-50">
                <TableRow>
                  <TableHead className="w-44">Employee</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Position</TableHead>
                  <TableHead className="text-right">Evaluation</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Gross (USD)</TableHead>
                  <TableHead className="text-center">
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help">
                            Decouple
                            <Info className="h-3.5 w-3.5 text-blue-500" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="center" className="max-w-sm text-left">
                          <p className="text-xs font-semibold mb-1">Claim Dependents (TOS) — per employee</p>
                          <p className="text-[11px] leading-relaxed">
                            Cambodian TOS lets one parent subtract 150,000 KHR per dependent
                            (housewife spouse + each child) from the monthly taxable base.
                            When both spouses work, only one should claim — this flag
                            designates that claimant.
                          </p>
                          <ul className="text-[11px] mt-1.5 list-disc pl-4 space-y-0.5">
                            <li><strong>Decouple = Yes</strong>: this row is the claimant. Dependents = <code>spouse + children</code>.</li>
                            <li><strong>Spouse = Yes</strong> adds 1 (the housewife allowance). Set <strong>No</strong> for widowed / divorced single parents, or dual-earner couples where no housewife exists.</li>
                            <li><strong>Children</strong> comes from <em>Number of Children</em> on the employee profile, regardless of marital status.</li>
                            <li><strong>Decouple = No</strong> (default): no dependents claimed here — the other spouse claims at their workplace, or there are none.</li>
                          </ul>
                          <p className="text-[11px] mt-1.5 text-gray-500">
                            Edit on <strong>Employees → Profile → Claim Dependents (TOS) / Claim Spouse</strong>.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-right">Taxable (KHR)</TableHead>
                  <TableHead className="text-right">Bracket</TableHead>
                  <TableHead className="text-right">Tax (KHR)</TableHead>
                  <TableHead className="text-right">Tax (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-sm text-gray-500 py-6">
                      {ready
                        ? 'No active employees to display.'
                        : 'Configure Tax Brackets + KHR/USD rate to see the preview.'}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(r => (
                  <TableRow key={r.employee.id}>
                    <TableCell className="w-44">
                      <div className="font-medium text-sm truncate">{r.employee.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{r.employee.id}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.basicUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.positionAllowanceUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.evaluationAllowanceUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums text-gray-600">{money(r.otUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums text-gray-600">{money(r.bonusUsd)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(r.grossUsd)}</TableCell>
                    <TableCell className="text-center text-xs">
                      {r.employee.decouple ? (() => {
                        const spouse   = r.employee.claimSpouse ? 1 : 0;
                        const children = r.employee.numberOfChildren ?? 0;
                        // Compact breakdown — "Yes (3 = 1s+2c)" reads quickly
                        // once HR knows the legend, and the tooltip spells
                        // out the math in plain English.
                        return (
                          <span
                            className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5"
                            title={r.dependents > 0
                              ? `${r.dependents} dependent${r.dependents === 1 ? '' : 's'} = ${spouse} spouse + ${children} ${children === 1 ? 'child' : 'children'} (saves ${formatNumber(r.dependents * 150_000)} KHR from taxable base)`
                              : 'Decoupled but Spouse=No and 0 children, so no deduction applies'}
                          >
                            Yes ({r.dependents}
                            {(spouse > 0 || children > 0) && (
                              <span className="opacity-70 ml-0.5">
                                {' '}= {spouse}s+{children}c
                              </span>
                            )}
                            )
                          </span>
                        );
                      })() : (
                        <span className="text-gray-400" title="Not claiming family dependents on this payslip">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.taxableKhr)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.bracket
                        ? `${r.bracket.ratePercent}% (−${formatNumber(r.bracket.excessAmount)})`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.taxKhr)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-red-700">
                      {money(r.taxUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Summary footer */}
          {rows.length > 0 && (
            <div className="flex items-center justify-between rounded-md border bg-gray-50 px-4 py-3">
              <div className="text-sm">
                <span className="text-gray-500">Period:</span>{' '}
                <strong>{periodLabel}</strong>{' · '}
                <span className="text-gray-500">Employees:</span>{' '}
                <strong>{rows.length}</strong>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Total Tax (USD):</span>{' '}
                <strong className="text-red-700">{money(totalTaxUsd)}</strong>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={handleDownloadExcel}
            disabled={rows.length === 0}
            title={rows.length === 0 ? 'Configure Tax Brackets to enable export' : undefined}
          >
            <Download className="mr-2 h-4 w-4" /> Download Excel
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
