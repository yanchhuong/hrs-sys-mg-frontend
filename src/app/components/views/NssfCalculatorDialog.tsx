import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2, ShieldCheck } from 'lucide-react';

import * as nssfApi from '../../api/nssf';
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

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtKhr(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

/**
 * NSSF Calculator — computes the monthly National Social Security Fund
 * contributions for every active employee and lets HR generate a
 * standalone payroll batch carrying the employee 2% pension line.
 *
 * <p><strong>Warning:</strong> the regular Salary batch already deducts
 * NSSF inline. Use this dialog only when running NSSF as a separate
 * payment cycle — otherwise the same employee gets deducted twice.
 */
export function NssfCalculatorDialog({ open, onOpenChange, onCreated }: Props) {
  const initialMonth = useMemo(defaultMonth, []);
  const [month, setMonth] = useState<string>(initialMonth);
  /** Dialog-only FX override (KHR/USD). Blank = use the tenant's
   *  configured rate from Settings → Tax Brackets. Lets HR preview
   *  "what would NSSF look like at 4,050 next month" without touching
   *  the tenant config. */
  const [fxOverride, setFxOverride] = useState<string>('');
  const [preview, setPreview] = useState<nssfApi.NssfPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by employeeId. Seeded from the
   *  preview's eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());
  /** Status filter — 'eligible' is the default since that's the only
   *  cohort HR can actually generate a batch for. 'all' is a peek mode
   *  to spot-check why a row dropped out (inactive / resigned / no base). */
  const [statusFilter, setStatusFilter] = useState<'eligible' | 'all'>('eligible');

  useEffect(() => {
    if (!open) return;
    setMonth(defaultMonth());
    setFxOverride('');
    setPreview(null);
    setIncluded(new Set());
    setStatusFilter('eligible');
  }, [open]);

  // Auto-fire the preview when the dialog opens or the month changes
  // — FX changes go through the Preview button since HR typically
  // tweaks the rate iteratively. cancelled-flag guards against late
  // responses after the dialog closes.
  useEffect(() => {
    if (!open || !month) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await nssfApi.preview(month);
        if (!cancelled) {
          setPreview(res);
          setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.employeeId)));
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load NSSF preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, month]);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const fxNum = fxOverride.trim() === '' ? undefined : Number(fxOverride);
      const fxArg = fxNum !== undefined && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : undefined;
      const res = await nssfApi.preview(month, fxArg);
      setPreview(res);
      setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.employeeId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load NSSF preview');
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
      await nssfApi.createBatch({
        month,
        employeeIds: Array.from(included),
      });
      toast.success(`NSSF batch created for ${included.size} employee${included.size === 1 ? '' : 's'}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create NSSF batch');
    } finally {
      setCreating(false);
    }
  };

  const toggleAll = () => {
    if (!preview) return;
    const all = preview.items.filter(i => i.eligible).map(i => i.employeeId);
    setIncluded(prev => prev.size === all.length ? new Set() : new Set(all));
  };

  const includedEmployeeTotalKhr = preview?.items
    .filter(i => included.has(i.employeeId))
    .reduce((s, i) => s + (i.employeePensionKhr || 0), 0) ?? 0;
  const includedEmployerTotalKhr = preview?.items
    .filter(i => included.has(i.employeeId))
    .reduce((s, i) => s + (i.employerTotalKhr || 0), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Compute NSSF Contributions
            <span className="text-xs font-normal text-gray-500 ml-1">— employee 2% + employer 5.4% on 1.2M KHR cap</span>
          </DialogTitle>
        </DialogHeader>

        {/* Controls strip — fixed. */}
        <div className="px-6 py-3 border-b shrink-0 bg-white space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-2">
                Rate (KHR / USD)
                {fxOverride.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setFxOverride('')}
                    className="text-[10px] uppercase tracking-wide text-emerald-700 hover:underline"
                  >
                    reset
                  </button>
                )}
              </Label>
              <Input
                inputMode="decimal"
                placeholder={preview && preview.khrPerUsd > 0 ? String(preview.khrPerUsd) : '4100'}
                value={fxOverride}
                onChange={e => setFxOverride(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
            <Button onClick={handlePreview} disabled={loading || !month}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
              Preview
            </Button>
          </div>
          <p className="text-[11px] text-amber-700">
            <strong>Warning:</strong> the regular Salary batch already deducts NSSF on each payslip. Generate this standalone batch <em>only</em> when running NSSF as its own payment cycle.
          </p>
        </div>

        {/* Summary chips — fixed when preview loaded. */}
        {preview && (
          <div className="px-6 py-2 border-b bg-gray-50 shrink-0 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <div>
                <span className="font-medium">{preview.items.length}</span> on roster
                <span className="text-gray-400 mx-2">·</span>
                <span className="font-medium text-emerald-700">{preview.eligibleCount}</span> eligible
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-gray-600">FX {preview.khrPerUsd} KHR/$</span>
                <span className="text-gray-400 mx-2">·</span>
                <span className="text-gray-600">Cap {fmtKhr(preview.wageCapKhr)} KHR</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('eligible')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${
                    statusFilter === 'eligible'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Eligible ({preview.eligibleCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${
                    statusFilter === 'all'
                      ? 'border-gray-500 bg-gray-100 text-gray-800 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All ({preview.items.length})
                </button>
              </div>
            </div>
            <div className="text-sm space-x-3">
              <span>
                Employee total: <span className="font-semibold tabular-nums">{fmtKhr(includedEmployeeTotalKhr)} KHR</span>
              </span>
              <span className="text-gray-400">·</span>
              <span>
                Employer: <span className="font-semibold tabular-nums">{fmtKhr(includedEmployerTotalKhr)} KHR</span>
              </span>
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
                        <TableHead className="text-right">Gross (KHR)</TableHead>
                        <TableHead className="text-right">Contributory</TableHead>
                        <TableHead className="text-right">Employee 2%</TableHead>
                        <TableHead className="text-right">Employer 5.4%</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const visible = statusFilter === 'eligible'
                          ? preview.items.filter(i => i.eligible)
                          : preview.items;
                        if (visible.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-6">
                                {statusFilter === 'eligible'
                                  ? 'No eligible employees for this month — switch to All to see why rows dropped out.'
                                  : 'No employees on roster for this month.'}
                              </TableCell>
                            </TableRow>
                          );
                        }
                        return visible.map(row => (
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
                              <div className="text-[11px] text-gray-500">{money(row.baseSalaryUsd)} base</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmtKhr(row.grossKhr)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmtKhr(row.contributoryKhr)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              <div className="font-medium">{fmtKhr(row.employeePensionKhr)}</div>
                              <div className="text-[10px] text-gray-500">≈ {money(row.employeePensionUsd)}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              <div className="font-medium">{fmtKhr(row.employerTotalKhr)}</div>
                              <div className="text-[10px] text-gray-500">
                                {fmtKhr(row.employerOccupationalKhr)} + {fmtKhr(row.employerHealthcareKhr)} + {fmtKhr(row.employerPensionKhr)}
                              </div>
                            </TableCell>
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
                        ));
                      })()}
                    </TableBody>
                  </Table>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!preview || included.size === 0 || creating}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate Batch ({included.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
