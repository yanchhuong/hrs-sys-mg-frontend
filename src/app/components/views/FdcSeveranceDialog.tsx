import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2, Scale, CheckCircle2 } from 'lucide-react';

import * as fdcApi from '../../api/fdcSeverance';
import { Employee } from '../../types/hrms';
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
  /** Reserved for future filtering — kept on the props for API
   *  compatibility with the older single-pick version of the dialog. */
  fdcEmployees?: Employee[];
  onCreated?: () => void;
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

/**
 * Compute 5% Severance — bulk preview.
 *
 * <p>Lists every employee on an active FDC contract with their
 * quarter-based severance already computed (startSalary × full-quarters
 * × 3 × rate%). HR sees a green check next to each eligible row and
 * can multi-select which contracts to include in the generated batch.
 * Ineligible rows stay in the list with their reason badge so HR can
 * spot-check why anyone dropped from the actionable cohort.
 */
export function FdcSeveranceDialog({ open, onOpenChange, onCreated }: Props) {
  const { formatDate } = useDateFormat();
  const [ratePercent, setRatePercent] = useState<string>('5');
  const [preview, setPreview] = useState<fdcApi.FdcSeveranceAll | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Per-row include toggle keyed by contractId. Seeded from eligible rows. */
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'eligible' | 'all'>('eligible');

  useEffect(() => {
    if (!open) return;
    setRatePercent('5');
    setPreview(null);
    setIncluded(new Set());
    setStatusFilter('eligible');
  }, [open]);

  // Auto-pull the full list as soon as the dialog opens so HR doesn't
  // have to click Preview before seeing the cohort.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rate = Number(ratePercent);
        const res = await fdcApi.previewAll(Number.isFinite(rate) && rate > 0 ? rate : undefined);
        if (!cancelled) {
          setPreview(res);
          setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.contractId)));
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load FDC employees');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // ratePercent intentionally omitted — rate edits go through Recalc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRecalc = async () => {
    setLoading(true);
    try {
      const rate = Number(ratePercent);
      const res = await fdcApi.previewAll(Number.isFinite(rate) && rate > 0 ? rate : undefined);
      setPreview(res);
      setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.contractId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reload FDC employees');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview || included.size === 0) {
      toast.error('Pick at least one eligible employee to include in the batch');
      return;
    }
    setCreating(true);
    try {
      const rate = Number(ratePercent);
      // Bulk createBatch wants the (from, to) window covering every
      // included contract's endDate. Picking min(startDate) → max(endDate)
      // guarantees they all land inside the preview's window-scan.
      const included_rows = preview.items.filter(i => included.has(i.contractId));
      const from = included_rows.reduce((m, r) => r.startDate < m ? r.startDate : m, included_rows[0].startDate);
      const to   = included_rows.reduce((m, r) => r.endDate   > m ? r.endDate   : m, included_rows[0].endDate);
      await fdcApi.createBatch({
        from,
        to,
        ratePercent: Number.isFinite(rate) && rate > 0 ? rate : undefined,
        contractIds: Array.from(included),
      });
      toast.success(`5% Severance batch created for ${included.size} employee${included.size === 1 ? '' : 's'}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create severance batch');
    } finally {
      setCreating(false);
    }
  };

  const toggleAll = () => {
    if (!preview) return;
    const all = preview.items.filter(i => i.eligible).map(i => i.contractId);
    setIncluded(prev => prev.size === all.length ? new Set() : new Set(all));
  };

  const visibleRows = preview
    ? (statusFilter === 'eligible' ? preview.items.filter(i => i.eligible) : preview.items)
    : [];

  const includedTotal = preview?.items
    .filter(i => included.has(i.contractId))
    .reduce((s, i) => s + (i.severance || 0), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            Compute 5% Severance
          </DialogTitle>
          <DialogDescription>
            Every employee on an active FDC contract — one row each, with the quarter-based severance already computed.
            Tick the rows you want to include in the batch.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-3 items-end">
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
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <Button onClick={handleRecalc} disabled={loading} variant="outline">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Recalc
                </Button>
                <p className="text-[11px] text-gray-500 self-end">
                  One installment per completed <strong>3-month block</strong>, locked to the <strong>salary at contract start</strong>.
                  Trailing 1–2 months don't accrue.
                </p>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    <div>
                      <span className="font-medium">{preview.rosterSize}</span> on FDC
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="font-medium text-emerald-700">{preview.eligibleCount}</span> eligible
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-gray-600">Rate {preview.ratePercent}%</span>
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
                  <div className="text-sm">
                    Included total: <span className="font-semibold text-amber-700 tabular-nums">{money(includedTotal)}</span>
                  </div>
                </div>

                <div className="max-h-[55vh] overflow-y-auto">
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
                        <TableHead className="w-12 text-center">Status</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead className="text-right">Start Salary</TableHead>
                        <TableHead className="text-center">Months</TableHead>
                        <TableHead className="text-center" title="floor(months ÷ 3)">Quarters</TableHead>
                        <TableHead className="text-right">Total Wages</TableHead>
                        <TableHead className="text-right">Severance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-6">
                            {statusFilter === 'eligible'
                              ? 'No eligible FDC employees. Switch to All to see why any rows dropped.'
                              : 'No active FDC contracts on file.'}
                          </TableCell>
                        </TableRow>
                      )}
                      {visibleRows.map(row => (
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
                          <TableCell className="text-center">
                            {row.eligible ? (
                              <CheckCircle2
                                className="h-5 w-5 text-emerald-600 inline-block"
                                aria-label="Eligible — can be calculated"
                              />
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]"
                                title={row.reason ?? ''}
                              >
                                ✕
                              </Badge>
                            )}
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
                          <TableCell className="text-right tabular-nums text-sm">{money(row.startSalary)}</TableCell>
                          <TableCell className="text-center text-sm">{row.contractMonths}</TableCell>
                          <TableCell className="text-center text-sm font-medium">{row.fullQuarters}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(row.totalWages)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-semibold text-amber-700">{money(row.severance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!preview || included.size === 0 || creating || loading}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate Batch ({included.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
