import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Loader2, Scale } from 'lucide-react';

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
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SearchablePicker } from '../common/SearchablePicker';
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
  /** Employees with an *active* FDC contract — the only ones who can
   *  receive a 5% Severance line. Parent computes this from the active
   *  contracts list so the dialog doesn't have to. */
  fdcEmployees: Employee[];
  /** Optional re-fetch hook for the parent's batch list. */
  onCreated?: () => void;
}

function money(n: number): string {
  return `$${formatMoney(n)}`;
}

/**
 * Per-employee 5% FDC Severance calculator.
 *
 * <p>The earlier window-scan version made HR pick a date range and then
 * a contract from a multi-row preview — too clicky for what is almost
 * always a one-at-a-time payout. This redesigned dialog flips it: pick
 * the FDC employee, the server returns their active contract's monthly
 * gross earnings, and HR sees the wage base build up row-by-row before
 * generating a single-line batch. Backed by
 * {@code GET /api/v1/payroll/fdc-severance/preview-by-employee}.
 */
export function FdcSeveranceDialog({ open, onOpenChange, fdcEmployees, onCreated }: Props) {
  const { formatDate } = useDateFormat();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [ratePercent, setRatePercent] = useState<string>('5');
  const [preview, setPreview] = useState<fdcApi.FdcSeveranceEmployeePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Reset on each open so a stale preview from a prior session doesn't
  // bleed into the next one.
  useEffect(() => {
    if (!open) return;
    setEmployeeId('');
    setRatePercent('5');
    setPreview(null);
  }, [open]);

  // Auto-fetch the preview whenever the selected employee changes —
  // saves HR an extra click; the rate update has its own Recalc button.
  useEffect(() => {
    if (!open || !employeeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rate = Number(ratePercent);
        const res = await fdcApi.previewByEmployee(
          employeeId,
          Number.isFinite(rate) && rate > 0 ? rate : undefined,
        );
        if (!cancelled) setPreview(res);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load severance preview');
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // ratePercent intentionally omitted — re-runs land via handleRecalc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, open]);

  const handleRecalc = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const rate = Number(ratePercent);
      const res = await fdcApi.previewByEmployee(
        employeeId,
        Number.isFinite(rate) && rate > 0 ? rate : undefined,
      );
      setPreview(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to recalculate severance');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview || !preview.contractId || !preview.eligible) return;
    setCreating(true);
    try {
      const rate = Number(ratePercent);
      // Window narrows to the contract's endDate ± 0 so the backend's
      // window-scan picks the same contract we're previewing. createBatch
      // re-runs the math server-side; we only ship the contract id.
      const end = preview.endDate ?? '';
      await fdcApi.createBatch({
        from: preview.startDate ?? end,
        to: end,
        ratePercent: Number.isFinite(rate) && rate > 0 ? rate : undefined,
        contractIds: [preview.contractId],
      });
      toast.success(`5% Severance batch created for ${preview.name}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create severance batch');
    } finally {
      setCreating(false);
    }
  };

  const pickerOptions = fdcEmployees.map(emp => {
    const val = (emp as { apiId?: string }).apiId ?? emp.id;
    return {
      value: val,
      label: emp.name,
      secondary: `${emp.id}${emp.position ? ` · ${emp.position}` : ''}`,
      searchKey: `${emp.name} ${emp.id} ${emp.position ?? ''} ${emp.khmerName ?? ''}`,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[1400px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            Compute 5% Severance
          </DialogTitle>
          <DialogDescription>
            Pick one FDC employee — the calculator pulls every month they were paid under their active contract and applies the 5% rate to the gross wage base.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">FDC employee</Label>
                  <SearchablePicker
                    options={pickerOptions}
                    value={employeeId}
                    onChange={setEmployeeId}
                    placeholder="Select FDC employee…"
                    searchPlaceholder="Search by name, ID, or position…"
                    allowClear={false}
                  />
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
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <Button onClick={handleRecalc} disabled={loading || !employeeId} variant="outline">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Recalc
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">
                One installment per completed <strong>3-month block</strong>, locked to the <strong>salary at contract start</strong> (pay raises during the contract do not change the severance). Trailing 1–2 months of a non-multiple-of-3 contract don't contribute. Legal minimum 5% (Cambodian Labour Law); raise here for a more generous batch.
              </p>
            </CardContent>
          </Card>

          {fdcEmployees.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-gray-500">
                No employees with an active FDC contract on file. Add or update a contract under <strong>Employees → Contracts</strong> first.
              </CardContent>
            </Card>
          )}

          {preview && !loading && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{preview.name}{preview.empNo ? ` · ${preview.empNo}` : ''}</div>
                    <div className="text-xs text-gray-500">
                      {preview.startDate && preview.endDate
                        ? <>Contract {formatDate(preview.startDate)} → {formatDate(preview.endDate)}</>
                        : 'No active FDC contract on file'}
                      {preview.terminationReason && (
                        <Badge
                          variant="outline"
                          className={
                            preview.terminationReason.toLowerCase() === 'misconduct'
                              ? 'ml-2 text-[10px] bg-red-50 text-red-700 border-red-200'
                              : 'ml-2 text-[10px] bg-gray-50 text-gray-600 border-gray-200'
                          }
                        >
                          {preview.terminationReason}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {preview.eligible ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-0">Eligible</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                      {preview.reason ?? 'Not eligible'}
                    </Badge>
                  )}
                </div>

                {/* Summary row: start salary, months, quarters that count. */}
                <div className="px-4 py-3 border-b bg-white grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Start Salary</div>
                    <div className="font-semibold tabular-nums">{money(preview.startSalary)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Contract Months</div>
                    <div className="font-semibold tabular-nums">{preview.contractMonths}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Full Quarters</div>
                    <div className="font-semibold tabular-nums">{preview.fullQuarters}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Rate</div>
                    <div className="font-semibold tabular-nums">{preview.ratePercent}%</div>
                  </div>
                </div>

                {preview.quarters.length > 0 && (
                  <div className="max-h-[40vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                          <TableHead className="w-16">Quarter</TableHead>
                          <TableHead>Months</TableHead>
                          <TableHead className="text-right" title="Start Salary × 3 × rate%">Installment</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.quarters.map((q) => (
                          <TableRow key={q.number}>
                            <TableCell className="text-sm font-medium">Q{q.number}</TableCell>
                            <TableCell className="text-sm">{q.monthRange}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{money(q.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {preview.quarters.length === 0 && preview.startDate && preview.endDate && (
                  <div className="px-4 py-6 text-center text-xs text-gray-500">
                    This contract is shorter than one full 3-month block — no severance installment accrues.
                  </div>
                )}

                <div className="px-4 py-3 border-t bg-gray-50 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Total Wages</div>
                    <div className="font-semibold tabular-nums">{money(preview.totalWages)}</div>
                    <div className="text-[10px] text-gray-400">{preview.fullQuarters} × 3 × {money(preview.startSalary)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Quarter Installment</div>
                    <div className="font-semibold tabular-nums">
                      {preview.fullQuarters > 0 ? money(preview.severance / preview.fullQuarters) : money(0)}
                    </div>
                    <div className="text-[10px] text-gray-400">{money(preview.startSalary)} × 3 × {preview.ratePercent}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Severance</div>
                    <div className="font-semibold text-amber-700 tabular-nums">{money(preview.severance)}</div>
                  </div>
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
            disabled={!preview || !preview.eligible || creating || loading}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
