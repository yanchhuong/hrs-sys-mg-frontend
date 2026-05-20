import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2, Scale } from 'lucide-react';

import * as fdcApi from '../../api/fdcSeverance';
import { formatMoney } from '../../utils/format';
import { useDateFormat } from '../../context/DateFormatContext';
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
  /** Re-fetch the parent's batch list after a successful create. */
  onCreated?: () => void;
}

/** Default to the calendar quarter that just ended — typical FDC
 *  payroll cadence is "wrap up last quarter's expiries". Frontend
 *  uses ISO YYYY-MM-DD to match {@code <input type="date">}. */
function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  const qStart = Math.floor(m / 3) * 3;
  const startMonth = String(qStart + 1).padStart(2, '0');
  const endMonth = String(qStart + 3).padStart(2, '0');
  const lastDay = new Date(y, qStart + 3, 0).getDate();
  return { from: `${y}-${startMonth}-01`, to: `${y}-${endMonth}-${lastDay}` };
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

export function FdcSeveranceDialog({ open, onOpenChange, onCreated }: Props) {
  const initial = useMemo(defaultPeriod, []);
  const { formatDate } = useDateFormat();
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [ratePercent, setRatePercent] = useState<string>('5');

  const [preview, setPreview] = useState<fdcApi.FdcSeverancePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by contractId. Seeded from the
   *  preview's eligible rows; HR can drop rows out without re-running
   *  the preview. */
  const [included, setIncluded] = useState<Set<string>>(new Set());

  // Reset state every time the dialog re-opens — a stale preview from
  // a previous session shouldn't bleed into the next one.
  useEffect(() => {
    if (!open) return;
    const d = defaultPeriod();
    setFrom(d.from);
    setTo(d.to);
    setRatePercent('5');
    setPreview(null);
    setIncluded(new Set());
  }, [open]);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const rate = Number(ratePercent);
      const res = await fdcApi.preview(from, to, Number.isFinite(rate) && rate > 0 ? rate : undefined);
      setPreview(res);
      setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.contractId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load FDC severance preview');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    if (included.size === 0) {
      toast.error('Pick at least one contract to include in the batch');
      return;
    }
    setCreating(true);
    try {
      const rate = Number(ratePercent);
      await fdcApi.createBatch({
        from,
        to,
        ratePercent: Number.isFinite(rate) && rate > 0 ? rate : undefined,
        contractIds: Array.from(included),
      });
      toast.success(`FDC severance batch created for ${included.size} contract${included.size === 1 ? '' : 's'}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create FDC severance batch');
    } finally {
      setCreating(false);
    }
  };

  const toggleAll = () => {
    if (!preview) return;
    const all = preview.items.filter(i => i.eligible).map(i => i.contractId);
    setIncluded(prev => prev.size === all.length ? new Set() : new Set(all));
  };

  const includedTotal = preview?.items
    .filter(i => included.has(i.contractId))
    .reduce((sum, i) => sum + (i.severance || 0), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            Compute 5% Severance
          </DialogTitle>
          <DialogDescription>
            Pick a window of FDC contract expiries — the calculator shows the 5% × total-wages owed on each natural expiry. Generate a payroll batch from the eligible rows to route through the standard approval flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-1">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Expiry from</Label>
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expiry to</Label>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rate (%)</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={ratePercent}
                      onChange={e => setRatePercent(e.target.value)}
                      placeholder="5"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={handlePreview} disabled={loading} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                    Preview
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Wage base is gross — sum of monthly_gross_earnings.totalEarnings across the contract's active months. Legal minimum is 5% (Cambodian Labour Law); raise it here for a more generous batch without touching Settings.
              </p>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <div className="text-sm">
                    <span className="font-medium">{preview.items.length}</span> contracts in window
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="font-medium text-emerald-700">{preview.eligibleCount}</span> eligible
                    <span className="text-gray-400 mx-2">·</span>
                    <span className="text-gray-600">Rate {preview.ratePercent}%</span>
                  </div>
                  <div className="text-sm">
                    Included total: <span className="font-semibold">{money(includedTotal)}</span>
                  </div>
                </div>
                <div className="max-h-[40vh] overflow-y-auto">
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
                        <TableHead>Contract</TableHead>
                        <TableHead className="text-center">Months</TableHead>
                        <TableHead className="text-right">Total Wages</TableHead>
                        <TableHead className="text-right">Severance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-gray-500 py-6">
                            No FDC contracts expire in this window.
                          </TableCell>
                        </TableRow>
                      )}
                      {preview.items.map(row => (
                        <TableRow key={row.contractId} className={row.eligible ? '' : 'opacity-60'}>
                          <TableCell>
                            <Checkbox
                              checked={included.has(row.contractId)}
                              disabled={!row.eligible}
                              onCheckedChange={() => {
                                setIncluded(prev => {
                                  const next = new Set(prev);
                                  if (next.has(row.contractId)) next.delete(row.contractId);
                                  else next.add(row.contractId);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{row.name}</div>
                            {row.empNo && <div className="text-[11px] text-gray-500">{row.empNo}</div>}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{formatDate(row.startDate)}</div>
                            <div className="text-gray-500">→ {formatDate(row.endDate)}</div>
                            {row.terminationReason && (
                              <div className="mt-1">
                                <Badge
                                  variant="outline"
                                  className={
                                    row.terminationReason.toLowerCase() === 'misconduct'
                                      ? 'text-[10px] bg-red-50 text-red-700 border-red-200'
                                      : 'text-[10px] bg-gray-50 text-gray-600 border-gray-200'
                                  }
                                >
                                  {row.terminationReason}
                                </Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">{row.monthsActive}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.totalWages)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{money(row.severance)}</TableCell>
                          <TableCell>
                            {row.eligible ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0">Eligible</Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-gray-50 text-gray-600 border-gray-200 text-[11px]"
                                title={row.reason ?? ''}
                              >
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
