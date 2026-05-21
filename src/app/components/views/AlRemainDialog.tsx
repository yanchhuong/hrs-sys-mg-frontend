import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2, CalendarDays } from 'lucide-react';

import * as alApi from '../../api/alRemain';
import { formatMoney } from '../../utils/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
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
  onCreated?: () => void;
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

/** "2026-01" → "Jan '26" (single-year window keeps the column header
 *  compact; cross-year windows still show the suffix so HR can tell
 *  Jan 2025 apart from Jan 2026). */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  const name = MONTH_ABBR[idx] ?? m;
  return `${name} '${y.slice(2)}`;
}

type Period = 'full' | 'h1' | 'h2';

/** Map (year + period) → fromMonth/toMonth pair the backend expects.
 *  H1 = Jan–Jun, H2 = Jul–Dec, Full = Jan–Dec. */
function windowFor(year: number, period: Period): { from: string; to: string } {
  const y = String(year);
  switch (period) {
    case 'h1':   return { from: `${y}-01`, to: `${y}-06` };
    case 'h2':   return { from: `${y}-07`, to: `${y}-12` };
    case 'full':
    default:     return { from: `${y}-01`, to: `${y}-12` };
  }
}

/** Default to the current calendar half — H1 (Jan→Jun) when we're before
 *  July, otherwise H2 (Jul→Dec). Mirrors the Seniority Indemnity
 *  dialog's defaulting logic so the two calculators feel consistent. */
function defaultPeriod(): Period {
  return new Date().getMonth() + 1 <= 6 ? 'h1' : 'h2';
}

/**
 * AL Remain calculator — payout for unused annual leave at year end,
 * half-year, or on resignation. Same daily-wage math as Seniority; the
 * day count is the employee's pro-rated annual leave (allocation ÷ 12
 * × months_in_window) minus approved usage inside the window.
 */
export function AlRemainDialog({ open, onOpenChange, onCreated }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const [preview, setPreview] = useState<alApi.AlRemainPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by employeeId. Seeded from eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setYear(new Date().getFullYear());
    setPeriod(defaultPeriod());
    setPreview(null);
    setIncluded(new Set());
  }, [open]);

  // Auto-fire the preview whenever the dialog opens or the user changes
  // year / period — saves the extra Preview click and matches how the
  // 5% Severance and NSSF dialogs feel. Cancelled-flag guards against
  // late responses landing after the dialog closed.
  useEffect(() => {
    if (!open || !year || year < 2000 || year > 2100) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { from, to } = windowFor(year, period);
        const res = await alApi.preview(from, to);
        if (!cancelled) {
          setPreview(res);
          setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.employeeId)));
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load AL Remain preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, year, period]);

  const handlePreview = async () => {
    // Manual recalc — same flow as the auto effect above. Kept on the
    // button so HR can force a refresh after creating allocations or
    // approving leaves in another tab.
    if (!year || year < 2000 || year > 2100) {
      toast.error('Enter a valid year');
      return;
    }
    setLoading(true);
    try {
      const { from, to } = windowFor(year, period);
      const res = await alApi.preview(from, to);
      setPreview(res);
      setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.employeeId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load AL Remain preview');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    if (included.size === 0) {
      toast.error('Pick at least one employee to include in the batch');
      return;
    }
    setCreating(true);
    try {
      await alApi.createBatch({
        fromMonth: preview.fromMonth,
        toMonth: preview.toMonth,
        includeEmployeeIds: Array.from(included),
      });
      toast.success(`AL Remain batch created for ${included.size} employee${included.size === 1 ? '' : 's'}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create AL Remain batch');
    } finally {
      setCreating(false);
    }
  };

  const toggleAll = () => {
    if (!preview) return;
    const all = preview.items.filter(i => i.eligible).map(i => i.employeeId);
    setIncluded(prev => prev.size === all.length ? new Set() : new Set(all));
  };

  const includedTotal = preview?.items
    .filter(i => included.has(i.employeeId))
    .reduce((s, i) => s + (i.amount || 0), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            Compute AL Remain
            <span className="text-xs font-normal text-gray-500 ml-1">— unused annual-leave payout</span>
          </DialogTitle>
        </DialogHeader>

        {/* Controls strip — fixed, doesn't scroll with the body. */}
        <div className="px-6 py-3 border-b shrink-0 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={e => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setYear(n);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <div className="flex gap-2">
                {([
                  { value: 'full', label: 'Full Year', sub: 'Jan – Dec' },
                  { value: 'h1',   label: 'Half (H1)', sub: 'Jan – Jun' },
                  { value: 'h2',   label: 'Half (H2)', sub: 'Jul – Dec' },
                ] as Array<{ value: Period; label: string; sub: string }>).map(opt => {
                  const active = period === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPeriod(opt.value)}
                      className={`flex-1 px-3 py-2 text-sm border rounded-md transition text-left ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] opacity-80">{opt.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={handlePreview} disabled={loading || !year} className="md:w-32">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
              Preview
            </Button>
          </div>
        </div>

        {/* Summary chips — fixed when preview loaded. */}
        {preview && (
          <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50 shrink-0 flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-medium">{preview.rosterSize}</span> on roster
              <span className="text-gray-400 mx-2">·</span>
              <span className="font-medium text-emerald-700">{preview.eligibleCount}</span> eligible
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-600">{preview.monthsInWindow} months</span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-600">Divisor {preview.daysDivisor}</span>
            </div>
            <div className="text-sm">
              Included total: <span className="font-semibold tabular-nums">{money(includedTotal)}</span>
            </div>
          </div>
        )}

        {/* Table — only this scrolls. */}
        <div className="flex-1 min-h-0 overflow-auto">
          {preview && (
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={included.size > 0 && included.size === preview.items.filter(i => i.eligible).length}
                            onCheckedChange={toggleAll}
                            aria-label="Toggle all eligible rows"
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right" title="Years of service as of window end. +1 day annual leave per completed 3 years.">Tenure</TableHead>
                        <TableHead className="text-right" title="Base allocation + seniority bonus (+1 day per 3 years)">Annual</TableHead>
                        <TableHead className="text-right" title="Fractional months worked inside the window (handles mid-month hire / resignation)">Months</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        {preview.monthList.map(ym => (
                          <TableHead key={ym} className="text-right whitespace-nowrap" title={ym}>{monthLabel(ym)}</TableHead>
                        ))}
                        <TableHead className="text-right" title="Average of non-zero in-window months">Avg Gross</TableHead>
                        <TableHead className="text-right" title="Avg Gross ÷ working days (Mon-Sat = 26, Mon-Fri = 22)">Daily Wage</TableHead>
                        <TableHead className="text-right" title="Remaining × Daily Wage">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9 + preview.monthList.length} className="text-center text-sm text-gray-500 py-6">
                            No active employees for this window.
                          </TableCell>
                        </TableRow>
                      )}
                      {preview.items.map(row => (
                        <TableRow key={row.employeeId} className={row.eligible ? '' : 'opacity-60'}>
                          <TableCell>
                            <Checkbox
                              checked={included.has(row.employeeId)}
                              disabled={!row.eligible}
                              onCheckedChange={() => {
                                setIncluded(prev => {
                                  const next = new Set(prev);
                                  if (next.has(row.employeeId)) next.delete(row.employeeId);
                                  else next.add(row.employeeId);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{row.name}</div>
                            {row.empNo && <div className="text-[11px] text-gray-500">{row.empNo}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.yearsOfService.toFixed(1)}<span className="text-gray-400 text-[11px]">y</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            <div>{row.annualAllocatedDays}</div>
                            {row.seniorityBonusDays > 0 && (
                              <div className="text-[10px] text-indigo-600">+{row.seniorityBonusDays} bonus</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{row.monthsWorked.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{row.usedDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{row.remainingDays}</TableCell>
                          {preview.monthList.map(ym => {
                            const v = row.monthlyBreakdown?.[ym] ?? 0;
                            return (
                              <TableCell
                                key={ym}
                                className={`text-right tabular-nums text-sm whitespace-nowrap ${v <= 0 ? 'text-gray-300' : ''}`}
                              >
                                {money(v)}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right tabular-nums text-sm">{money(row.monthlyGross)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.dailyWage)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-indigo-700">{money(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!preview || included.size === 0 || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate Batch ({included.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
