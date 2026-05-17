import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, Info, Scale, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
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
      setIncluded(new Set(res.items.filter(i => i.eligible).map(i => i.employeeId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to compute seniority indemnity');
    } finally {
      setLoading(false);
    }
  };

  const selectedTotal = useMemo(() => {
    if (!preview) return 0;
    return preview.items
      .filter(i => i.eligible && included.has(i.employeeId))
      .reduce((sum, i) => sum + i.amount, 0);
  }, [preview, included]);

  const selectedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.items.filter(i => i.eligible && included.has(i.employeeId)).length;
  }, [preview, included]);

  const toggleAll = (allOn: boolean) => {
    if (!preview) return;
    setIncluded(allOn
      ? new Set(preview.items.filter(i => i.eligible).map(i => i.employeeId))
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
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            Compute Seniority Indemnity
          </DialogTitle>
          <DialogDescription>
            Cambodian Labour Law (2018 Prakas) — 7.5 days of wages paid each June and December
            to every UDC (Permanent) employee.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          {/* Period controls + Run button */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label htmlFor="seniority-start">Start date</Label>
                  <Input
                    id="seniority-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="seniority-end">End date</Label>
                  <Input
                    id="seniority-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-44"
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
                    className="w-28"
                    placeholder="7.5"
                  />
                </div>
                <Button onClick={loadPreview} disabled={loading} className="ml-auto">
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing…</>
                    : <><Calculator className="mr-2 h-4 w-4" /> Compute Preview</>}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Quick fill:</span>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2"
                        onClick={() => applyPreset('H1')}>
                  H1 — Jan→Jun
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2"
                        onClick={() => applyPreset('H2')}>
                  H2 — Jul→Dec
                </Button>
                <span className="text-gray-400">· The two legally-mandated payment windows under the 2018 Prakas. Override the dates or days field to compute back-pay or partial-period payments.</span>
              </div>
            </CardContent>
          </Card>

          {/* Explanation — collapsible so the table stays the focus once HR knows the rules */}
          <Accordion type="single" collapsible defaultValue={preview ? undefined : 'rules'}>
            <AccordionItem value="rules" className="border rounded-md">
              <AccordionTrigger className="px-4 hover:no-underline">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Info className="h-4 w-4 text-blue-600" />
                  How is this calculated? — Cambodian Labour Law &amp; Circular 002
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-sm text-gray-700 space-y-3">
                <div>
                  <p className="font-medium text-gray-900">Entitlement</p>
                  <p>
                    UDC (Undetermined Duration / Permanent) employees earn <strong>15 days of wages
                    per year of service</strong>, paid in two equal installments — <strong>7.5
                    days in June</strong> (H1) and <strong>7.5 days in December</strong> (H2).
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Formula</p>
                  <code className="block bg-gray-100 rounded px-3 py-2 text-xs font-mono whitespace-pre">
{`avg_monthly = sum(net_salary across selected months) ÷ months_found
daily_wage  = avg_monthly ÷ working_days
indemnity   = daily_wage × days_to_pay`}
                  </code>
                  <p className="text-xs text-gray-500">
                    Wage base is the <strong>average net salary</strong> across the
                    period's payroll batches — the 2018 Prakas calls for "average wage
                    and benefits", not the static base. <strong>1st&nbsp;Salary</strong>{' '}
                    batches are excluded from the average because they only carry a
                    mid-month half-net advance (no tax applied); the matching
                    <strong>&nbsp;2nd&nbsp;Salary</strong> settles the month. Single
                    <code> Salary</code> / <code>Salary &amp; Bonus</code> batches are
                    included as-is. If no qualifying payroll history covers the
                    window, we fall back to <code>base + allowance</code> and label the
                    row so HR can audit it. Standard payment is <strong>7.5 days each
                    June and December</strong>; override the Days field for back-pay
                    catch-ups or partial-period payments. <strong>working_days</strong>{' '}
                    comes from your General Attendance Settings &gt; Weekend Days
                    (Mon–Sat → 26, Mon–Fri → 22, Mon–Thu → 17).
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Eligibility</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    <li>Contract type must be <strong>UDC / Permanent</strong> (FDC and Probation are excluded).</li>
                    <li>Still employed on the last day of the semester (Jun 30 or Dec 31).</li>
                    <li>At least <strong>1 month</strong> of service within the semester.</li>
                    <li>Serious-misconduct termination forfeits the entitlement (handled manually for now).</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Tax (Circular 002, from 2020)</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    <li>Payments <strong>≤ 4,000,000 KHR (~USD 1,000)</strong> are exempt from salary tax.</li>
                    <li>Payments above the threshold are subject to the usual TOS brackets.</li>
                    <li>Always deductible as a business expense for income tax.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-900">FDC contracts</p>
                  <p>
                    Fixed-Duration employees are not eligible for seniority indemnity. They earn
                    a separate severance of <strong>5% of total wages</strong> at contract
                    expiry — handled outside this calculator.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Empty state */}
          {!preview && !loading && (
            <Card>
              <CardContent className="p-10 text-center text-sm text-gray-500">
                Set the date range &amp; days, then click <strong>Compute Preview</strong> to see
                eligible employees and computed amounts.
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {preview && (
            <>
              {/* Summary tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryTile label="Period"
                             value={`${preview.startDate} → ${preview.endDate}`}
                             sub="Selected date range" />
                <SummaryTile label="Eligible / Roster"
                             value={`${preview.eligibleCount} / ${preview.rosterCount}`}
                             sub="UDC employees still on the books" />
                <SummaryTile label="Days × divisor"
                             value={`${preview.daysPaid} / ${preview.daysDivisor}`}
                             sub={`${preview.daysPaid} days ÷ 26-day month`} />
                <SummaryTile label="Selected total"
                             value={money(selectedTotal)}
                             sub={`${selectedCount} included of ${preview.eligibleCount} eligible`}
                             highlight />
              </div>

              {/* Bulk toggle */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Uncheck a row to exclude that employee from the generated payroll batch.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                    Select all eligible
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Preview table */}
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Emp No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Join date</TableHead>
                      <TableHead className="text-right">Avg monthly</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead className="text-right">Daily wage</TableHead>
                      <TableHead className="text-right">Indemnity ({preview.daysPaid}d)</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-sm text-gray-500 py-6">
                          No employees on the roster for the selected semester.
                        </TableCell>
                      </TableRow>
                    )}
                    {preview.items.map(row => {
                      const checked = included.has(row.employeeId);
                      return (
                        <TableRow key={row.employeeId} className={!row.eligible ? 'bg-gray-50/60' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              disabled={!row.eligible}
                              onCheckedChange={(v) => {
                                setIncluded(prev => {
                                  const next = new Set(prev);
                                  if (v) next.add(row.employeeId);
                                  else next.delete(row.employeeId);
                                  return next;
                                });
                              }}
                              aria-label={row.eligible ? `Include ${row.name}` : `${row.name} not eligible`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.empNo}</TableCell>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-sm text-gray-700">
                            {row.contractType ?? <span className="italic text-gray-400">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">{row.joinDate}</TableCell>
                          <TableCell className="text-right">{money(row.monthlyWage)}</TableCell>
                          <TableCell>
                            {row.monthsFound > 0
                              ? <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 font-normal">
                                  Avg of {row.monthsFound} mo
                                </Badge>
                              : <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50 font-normal" title={row.basis}>
                                  Base + allowance
                                </Badge>}
                          </TableCell>
                          <TableCell className="text-right">{money(row.dailyWage)}</TableCell>
                          <TableCell className={`text-right font-semibold ${row.eligible ? 'text-green-700' : 'text-gray-400'}`}>
                            {money(row.amount)}
                          </TableCell>
                          <TableCell>
                            {row.eligible && (
                              row.taxExempt
                                ? <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">Exempt</Badge>
                                : <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">Taxable</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.eligible
                              ? <span className="inline-flex items-center gap-1 text-green-700 text-sm">
                                  <CheckCircle2 className="h-4 w-4" /> Eligible
                                </span>
                              : <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                                  <XCircle className="h-4 w-4" />
                                  {row.reason}
                                </span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
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

function SummaryTile({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-blue-300 bg-blue-50/40' : ''}>
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-lg font-semibold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
