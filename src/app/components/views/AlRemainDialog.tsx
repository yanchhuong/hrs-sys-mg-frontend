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

/**
 * AL Remain calculator — payout for unused annual leave at year end or
 * on resignation. Same daily-wage math as Seniority Indemnity; only the
 * day count is different (al_allocations − approved-used per employee).
 */
export function AlRemainDialog({ open, onOpenChange, onCreated }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [preview, setPreview] = useState<alApi.AlRemainPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by employeeId. Seeded from eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setYear(new Date().getFullYear());
    setPreview(null);
    setIncluded(new Set());
  }, [open]);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const res = await alApi.preview(year);
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
      await alApi.createBatch({ year, includeEmployeeIds: Array.from(included) });
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
            Unused annual-leave payout — remaining days (allocated − approved used) × daily wage. Pick a year and generate a payroll batch from the eligible rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-1">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                <div className="flex items-end">
                  <Button onClick={handlePreview} disabled={loading || !year} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                    Preview
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Daily wage = most-recent <code>monthly_gross_earnings.totalEarnings</code> ÷ working days (Mon–Sat = 26, Mon–Fri = 22). Half-day leaves count 0.5. Rows without an annual-leave allocation for the year fall out automatically.
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
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right">Monthly Gross</TableHead>
                        <TableHead className="text-right">Daily Wage</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-6">
                            No employees on roster for the year.
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
                          <TableCell className="text-right tabular-nums text-sm">{row.allocatedDays}</TableCell>
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
