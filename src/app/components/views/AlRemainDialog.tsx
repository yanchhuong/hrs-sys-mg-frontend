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

/**
 * AL Remain calculator — payout for unused annual leave at year end,
 * half-year, or on resignation. Same daily-wage math as Seniority; the
 * day count is the employee's pro-rated annual leave (allocation ÷ 12
 * × months_in_window) minus approved usage inside the window.
 */
export function AlRemainDialog({ open, onOpenChange, onCreated }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [period, setPeriod] = useState<Period>('full');
  const [preview, setPreview] = useState<alApi.AlRemainPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by employeeId. Seeded from eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setYear(new Date().getFullYear());
    setPeriod('full');
    setPreview(null);
    setIncluded(new Set());
  }, [open]);

  const handlePreview = async () => {
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
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            Compute AL Remain
          </DialogTitle>
          <DialogDescription>
            Unused annual-leave payout. Pick a window; the calculator pro-rates each employee's annual allocation by months_in_window ÷ 12, subtracts approved usage inside the window, then multiplies by daily wage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-1">
          <Card>
            <CardContent className="p-4">
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
              <p className="mt-3 text-[11px] text-gray-500">
                Half-year (H1 or H2) pro-rates each allocation by 6 ÷ 12. Daily wage = most-recent <code>monthly_gross_earnings.totalEarnings</code> ÷ working days (Mon–Sat = 26, Mon–Fri = 22). Half-day leaves count 0.5.
              </p>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-wrap gap-2">
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
                <div className="max-h-[50vh] overflow-y-auto">
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
                        <TableHead className="text-right" title="Sum of annual allocations across years touched by window">Annual</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right" title="Most-recent monthly_gross_earnings.totalEarnings — falls back to prior months, then base + position + evaluation">Monthly Gross</TableHead>
                        <TableHead className="text-right" title="Monthly Gross ÷ working days (Mon-Sat = 26, Mon-Fri = 22)">Daily Wage</TableHead>
                        <TableHead className="text-right" title="Remaining × Daily Wage">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-6">
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
                          <TableCell className="text-right tabular-nums text-sm">{row.annualAllocatedDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{row.usedDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{row.remainingDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.monthlyGross)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.dailyWage)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-indigo-700">{money(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
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
