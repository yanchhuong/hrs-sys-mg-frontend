import { useEffect, useMemo, useState } from 'react';
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
  onCreated?: () => void;
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

/** Default window — the calendar year that's currently in progress. HR
 *  can narrow it (e.g. Jan–Jun for a half-year cash-out) or widen it
 *  across year boundaries for a resignation that bridges two years. */
function defaultWindow(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  return { from: `${y}-01`, to: `${y}-12` };
}

/**
 * AL Remain calculator — payout for unused annual leave at year end,
 * half-year, or on resignation. Same daily-wage math as Seniority; the
 * day count is the employee's pro-rated annual leave (allocation ÷ 12
 * × months_in_window) minus approved usage inside the window.
 */
export function AlRemainDialog({ open, onOpenChange, onCreated }: Props) {
  const initial = useMemo(defaultWindow, []);
  const [fromMonth, setFromMonth] = useState<string>(initial.from);
  const [toMonth, setToMonth] = useState<string>(initial.to);
  const [preview, setPreview] = useState<alApi.AlRemainPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by employeeId. Seeded from eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const w = defaultWindow();
    setFromMonth(w.from);
    setToMonth(w.to);
    setPreview(null);
    setIncluded(new Set());
  }, [open]);

  const handlePreview = async () => {
    if (!fromMonth || !toMonth) {
      toast.error('Pick a start and end month');
      return;
    }
    if (toMonth < fromMonth) {
      toast.error('End month must be on or after start month');
      return;
    }
    setLoading(true);
    try {
      const res = await alApi.preview(fromMonth, toMonth);
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From month</Label>
                  <Input
                    type="month"
                    value={fromMonth}
                    onChange={e => setFromMonth(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To month</Label>
                  <Input
                    type="month"
                    value={toMonth}
                    onChange={e => setToMonth(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handlePreview} disabled={loading || !fromMonth || !toMonth} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                    Preview
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Half-year window (e.g. Jan–Jun) pro-rates each allocation by 6/12. Cross-year windows sum each year's pro-rated share. Daily wage = most-recent <code>monthly_gross_earnings.totalEarnings</code> ÷ working days (Mon–Sat = 26, Mon–Fri = 22). Half-day leaves count 0.5.
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
                        <TableHead className="text-right" title="Annual × months_in_window ÷ 12">In Window</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right" title="Most-recent monthly_gross_earnings.totalEarnings — falls back to prior months, then base + position + evaluation">Monthly Gross</TableHead>
                        <TableHead className="text-right" title="Monthly Gross ÷ working days (Mon-Sat = 26, Mon-Fri = 22)">Daily Wage</TableHead>
                        <TableHead className="text-right" title="Remaining × Daily Wage">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-sm text-gray-500 py-6">
                            No employees have an active annual-leave allocation for the year(s) in this window. Add allocations under <strong>Settings → Annual Leave</strong> first.
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
                          <TableCell className="text-right tabular-nums text-sm">{row.allocatedInWindow}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{row.usedDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{row.remainingDays}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.monthlyGross)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.dailyWage)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-indigo-700">{money(row.amount)}</TableCell>
                          <TableCell>
                            {row.eligible ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0">Eligible</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[11px]" title={row.reason ?? ''}>
                                {row.reason ?? 'Not eligible'}
                              </Badge>
                            )}
                          </TableCell>
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
