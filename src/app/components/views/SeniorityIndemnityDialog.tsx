import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Download, Info, Scale, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

import * as seniorityApi from '../../api/seniorityIndemnity';
import * as categoriesApi from '../../api/payrollCategories';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notified after a payroll batch is successfully created so the parent
   *  page can re-fetch its batch list. */
  onCreated?: () => void;
}

/** Default to the current calendar half — H1 (Jan→Jun) when we're before
 *  July, otherwise H2 (Jul→Dec). June/December are the legally-mandated
 *  payment months so landing on the active one is more useful than
 *  alphabetical default. Returns ISO YYYY-MM-DD strings to match
 *  {@code <input type="date">}. */
function defaultPeriod(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const isH1 = now.getMonth() + 1 <= 6;
  return isH1
    ? { startDate: `${y}-01-01`, endDate: `${y}-06-30` }
    : { startDate: `${y}-07-01`, endDate: `${y}-12-31` };
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SeniorityIndemnityDialog({ open, onOpenChange, onCreated }: Props) {
  const initial = useMemo(defaultPeriod, []);
  const [startDate, setStartDate] = useState<string>(initial.startDate);
  const [endDate, setEndDate] = useState<string>(initial.endDate);
  const [days, setDays] = useState<string>('7.5');

  const [preview, setPreview] = useState<seniorityApi.SeniorityIndemnityPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Per-row include toggle, keyed by employeeId. Defaults to "include every
  // eligible row" the first time a preview lands; lets HR drop someone out
  // (e.g. one-off side-payment scenarios) without touching the spreadsheet.
  const [included, setIncluded] = useState<Set<string>>(new Set());

  // Reset state every time the dialog opens — stops a stale preview from a
  // previous session bleeding into the next one. Also re-reads the
  // `seniority_indemnity` payroll category so the Days input mirrors the
  // value HR set in Settings → Payroll Categories (7.5 ships as the seed).
  useEffect(() => {
    if (!open) return;
    const d = defaultPeriod();
    setStartDate(d.startDate);
    setEndDate(d.endDate);
    setDays('7.5');
    setPreview(null);
    setIncluded(new Set());
    let cancelled = false;
    (async () => {
      try {
        const cats = await categoriesApi.list();
        const seniority = cats.find(c => c.code === 'seniority_indemnity');
        if (!cancelled && seniority && seniority.valueType === 'day' && seniority.defaultAmount > 0) {
          setDays(String(seniority.defaultAmount));
        }
      } catch {
        // Non-fatal — fall back to the literal 7.5 default set above.
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const applyPreset = (kind: 'H1' | 'H2') => {
    const y = new Date().getFullYear();
    setStartDate(kind === 'H1' ? `${y}-01-01` : `${y}-07-01`);
    setEndDate(kind === 'H1' ? `${y}-06-30` : `${y}-12-31`);
    setDays('7.5');
  };

  const loadPreview = async () => {
    const daysNum = Number(days);
    if (!startDate || !endDate) {
      toast.error('Start date and end date are required');
      return;
    }
    if (endDate < startDate) {
      toast.error('End date must be on or after start date');
      return;
    }
    if (!Number.isFinite(daysNum) || daysNum <= 0) {
      toast.error('Days must be greater than 0');
      return;
    }
    setLoading(true);
    try {
      const res = await seniorityApi.preview(startDate, endDate, daysNum);
      setPreview(res);
      // Default to "every row included" — HR can uncheck rows that
      // shouldn't get the payment. Eligibility is no longer enforced
      // here; the backend honours whatever the user selects.
      setIncluded(new Set(res.items.map(i => i.employeeId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to compute seniority indemnity');
    } finally {
      setLoading(false);
    }
  };

  // Selected total is computed from dailyWage × daysPaid for every
  // checked row regardless of eligibility — the backend used to force
  // amount=0 for ineligible rows, but the dialog now treats eligibility
  // as advisory + lets HR choose. The same formula drives the per-row
  // "Seniority" cell so the footer total always matches the sum of
  // what's visible above.
  const selectedTotal = useMemo(() => {
    if (!preview) return 0;
    return preview.items
      .filter(i => included.has(i.employeeId))
      .reduce((sum, i) => sum + i.dailyWage * preview.daysPaid, 0);
  }, [preview, included]);

  const selectedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.items.filter(i => included.has(i.employeeId)).length;
  }, [preview, included]);

  /**
   * Export the current preview to an .xlsx file so HR can archive / share
   * the calc. Mirrors the on-screen table columns plus an "Included"
   * marker so a reader can see which rows would have been pushed into the
   * Create Payroll Batch flow. Totals row sums the Seniority column.
   */
  const handleDownloadExcel = () => {
    if (!preview) return;
    // Pull month keys from the response so the spreadsheet header
    // matches what's on screen (Jan→Jun or Jul→Dec).
    const sample = preview.items.find(r => r.monthlyGross && Object.keys(r.monthlyGross).length > 0);
    const monthKeys = sample ? Object.keys(sample.monthlyGross) : [];

    // Short month labels (Jan, Feb, …) to match the on-screen headers.
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const xlsxShortLabel = (ym: string) => {
      const m = parseInt(ym.slice(5, 7), 10);
      return m >= 1 && m <= 12 ? MONTH_LABELS[m - 1] : ym;
    };
    const headers = [
      'Employee No', 'Employee Name',
      ...monthKeys.map(xlsxShortLabel),
      'Months found',
      'Daily wage (USD)', `Seniority (${preview.daysPaid} days)`,
      'Included',
    ];
    const sheetRows: (string | number)[][] = [];
    sheetRows.push([`Seniority Indemnity — ${preview.startDate} → ${preview.endDate} · ${preview.daysPaid} days × daily wage`]);
    sheetRows.push(headers);
    let totalSeniority = 0;
    // Per-month totals across the selected rows so the auditor can
    // verify the average without re-summing each column by hand.
    const monthTotals: Record<string, number> = {};
    for (const r of preview.items) {
      const seniorityUsd = r.dailyWage * preview.daysPaid;
      const isIncluded = included.has(r.employeeId);
      if (isIncluded) totalSeniority += seniorityUsd;
      const monthCells = monthKeys.map(k => {
        const v = r.monthlyGross?.[k] ?? 0;
        if (isIncluded) monthTotals[k] = (monthTotals[k] ?? 0) + v;
        return Number(v.toFixed(2));
      });
      sheetRows.push([
        r.empNo ?? '',
        r.name ?? '',
        ...monthCells,
        r.monthsFound,
        Number(r.dailyWage.toFixed(2)),
        Number(seniorityUsd.toFixed(2)),
        isIncluded ? 'Yes' : 'No',
      ]);
    }
    sheetRows.push([
      'TOTAL (selected)', '',
      ...monthKeys.map(k => Number((monthTotals[k] ?? 0).toFixed(2))),
      '',
      '',
      Number(totalSeniority.toFixed(2)),
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 12 }, // Emp No
      { wch: 26 }, // Name
      ...monthKeys.map(() => ({ wch: 14 })),
      { wch: 12 }, // Months
      { wch: 14 }, // Daily wage
      { wch: 18 }, // Seniority
      { wch: 10 }, // Included
    ];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Seniority Indemnity');
    XLSX.writeFile(wb, `Seniority-Indemnity-${preview.startDate}-to-${preview.endDate}.xlsx`);
  };

  const toggleAll = (allOn: boolean) => {
    if (!preview) return;
    setIncluded(allOn
      ? new Set(preview.items.map(i => i.employeeId))
      : new Set());
  };

  const handleCreate = async () => {
    if (!preview) return;
    if (selectedCount === 0) {
      toast.error('Select at least one eligible employee to include');
      return;
    }
    setCreating(true);
    try {
      const ids = preview.items
        .filter(i => i.eligible && included.has(i.employeeId))
        .map(i => i.employeeId);
      await seniorityApi.createBatch({
        startDate: preview.startDate,
        endDate: preview.endDate,
        days: preview.daysPaid,
        includeEmployeeIds: ids,
      });
      toast.success(`Seniority indemnity batch created — ${selectedCount} employees, ${money(selectedTotal)}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payroll batch');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Width + height mirror the Tax Calculator dialog so the two
          read as siblings. 95vw with a 1400px cap fits the 11-column
          preview table without horizontal scroll on standard monitors. */}
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            Calculate Seniority
          </DialogTitle>
          <DialogDescription>
            Cambodian Labour Law (2018 Prakas) — 7.5 days of wages paid each June and December
            to every UDC (Permanent) employee.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          {/* Period + days picker — same compact two-column shape as the
              Tax Calculator's Month/Year row. */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="seniority-start">Start date</Label>
              <Input
                id="seniority-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seniority-end">End date</Label>
              <Input
                id="seniority-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seniority-days">Days to pay</Label>
              <Input
                id="seniority-days"
                type="number"
                step="0.5"
                min="0"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="7.5"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">Quick fill:</span>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2"
                    onClick={() => applyPreset('H1')}>
              H1 — Jan→Jun
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2"
                    onClick={() => applyPreset('H2')}>
              H2 — Jul→Dec
            </Button>
            <Button onClick={loadPreview} disabled={loading} className="ml-auto" size="sm">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing…</>
                : <><Calculator className="mr-2 h-4 w-4" /> Compute Preview</>}
            </Button>
          </div>

          {/* Rules reference — mirrors the Tax Calculator's "Brackets in
              use" card. Formula first (so HR sees the math), then the
              key eligibility / tax / FDC rules in tight bullets. */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600" />
                <p className="font-semibold text-sm">Formula in use (Cambodian Labour Law 2018 Prakas)</p>
                {preview && (
                  <span className="text-xs text-gray-500">
                    working_days: {preview.daysDivisor} · days_to_pay: {preview.daysPaid}
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] bg-gray-100 rounded px-2 py-1 whitespace-pre-wrap">
{`avg_monthly = sum(total_earnings) ÷ count_of_non_zero_months
daily_wage  = avg_monthly ÷ working_days
indemnity   = daily_wage × days_to_pay

Jan-May (H1) / Jul-Nov (H2): read from payslip; $0 if no batch yet
Closing month (Jun or Dec):  projected from base + position +
                             evaluation + approved OT + bonus
Zero months drop out of the divisor — Apr $500 + May $500 averages
to $500/mo, not $167.`}
              </p>
              <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-gray-600 pt-1">
                <div>
                  <p className="font-semibold text-gray-800">Wage base</p>
                  Average <strong>gross earnings</strong> across the 6-month
                  window. Earlier months (Jan–May or Jul–Nov) read from
                  <code>monthly_gross_earnings</code> — <strong>$0 when no payslip
                  exists yet</strong>. The closing month (Jun or Dec) is
                  always <strong>projected</strong> from Basic + Position +
                  Evaluation + approved OT + active flat-dollar earnings.
                  Zero months are excluded from the divisor.
                </div>
                <div>
                  <p className="font-semibold text-gray-800">working_days</p>
                  From General Attendance Settings &gt; Weekend Days —
                  Mon–Sat → <strong>26</strong>, Mon–Fri → <strong>22</strong>,
                  Mon–Thu → <strong>17</strong>.
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Eligibility</p>
                  Contract = <strong>UDC / Permanent</strong>, still employed
                  on the last day of the semester, at least 1 month of
                  service in the window. FDC / Probation are excluded.
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Tax (Circular 002, 2020)</p>
                  Payments <strong>≤ 4,000,000 KHR (~USD 1,000)</strong> are
                  exempt; above the threshold the usual TOS brackets apply.
                  Always deductible as a business expense.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {!preview && !loading && (
            <Card>
              <CardContent className="p-10 text-center text-sm text-gray-500">
                Set the date range &amp; days, then click <strong>Compute Preview</strong> to see
                eligible employees and computed amounts.
              </CardContent>
            </Card>
          )}

          {preview && (
            <>
              {/* Bulk toggle row */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Uncheck a row to exclude that employee from the generated payroll batch.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Per-employee preview. Sticky header keeps column names
                  visible while HR scrolls a long roster. */}
              {(() => {
                // Pull the month keys (YYYY-MM) from the first row that
                // has them — every row in a response shares the same
                // window so this is stable. Short labels (Jan, Feb…) are
                // derived from the month part so the header stays narrow.
                const sample = preview.items.find(r => r.monthlyGross && Object.keys(r.monthlyGross).length > 0);
                const monthKeys = sample ? Object.keys(sample.monthlyGross) : [];
                const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const shortLabel = (ym: string) => {
                  const m = parseInt(ym.slice(5, 7), 10);
                  return m >= 1 && m <= 12 ? MONTH_LABELS[m - 1] : ym;
                };
                const totalCols = 5 + monthKeys.length; // checkbox + Employee + monthly columns + Basis + Daily + Seniority
                return (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-gray-50">
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Employee</TableHead>
                          {monthKeys.map(ym => (
                            <TableHead key={ym} className="text-right whitespace-nowrap" title={ym}>
                              {shortLabel(ym)}
                            </TableHead>
                          ))}
                          <TableHead>Basis</TableHead>
                          <TableHead className="text-right">Daily wage</TableHead>
                          <TableHead className="text-right">Seniority ({preview.daysPaid} days)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.items.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={totalCols} className="text-center text-sm text-gray-500 py-6">
                              No employees on the roster for the selected semester.
                            </TableCell>
                          </TableRow>
                        )}
                        {preview.items.map(row => {
                          const checked = included.has(row.employeeId);
                          return (
                            <TableRow key={row.employeeId}>
                              <TableCell>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setIncluded(prev => {
                                      const next = new Set(prev);
                                      if (v) next.add(row.employeeId);
                                      else next.delete(row.employeeId);
                                      return next;
                                    });
                                  }}
                                  aria-label={`Include ${row.name}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{row.name}</div>
                                <div className="font-mono text-xs text-gray-500">{row.empNo}</div>
                              </TableCell>
                              {monthKeys.map(ym => (
                                <TableCell key={ym} className="text-right tabular-nums text-sm">
                                  {money(row.monthlyGross?.[ym] ?? 0)}
                                </TableCell>
                              ))}
                              <TableCell>
                                {row.monthsFound > 0
                                  ? <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 font-normal"
                                           title={row.basis}>
                                      Avg of {row.monthsFound} mo
                                    </Badge>
                                  : <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50 font-normal" title={row.basis}>
                                      Base + allowance
                                    </Badge>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{money(row.dailyWage)}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-green-700">
                                {money(row.dailyWage * preview.daysPaid)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}

              {/* Summary footer — mirrors the Tax Calculator's bottom bar. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-gray-50 px-4 py-3 text-sm">
                <div>
                  <span className="text-gray-500">Period:</span>{' '}
                  <strong>{preview.startDate} → {preview.endDate}</strong>
                  {' · '}
                  <span className="text-gray-500">Roster:</span>{' '}
                  <strong>{preview.rosterCount}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Selected:</span>{' '}
                  <strong>{selectedCount}</strong> ·{' '}
                  <span className="text-gray-500">Total:</span>{' '}
                  <strong className="text-green-700">{money(selectedTotal)}</strong>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={handleDownloadExcel}
            disabled={!preview || preview.items.length === 0}
            title={!preview ? 'Compute Preview first to enable export' : undefined}
          >
            <Download className="mr-2 h-4 w-4" /> Download Excel
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!preview || selectedCount === 0 || creating}>
            {creating
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating batch…</>
              : <>Create Payroll Batch · {money(selectedTotal)}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
