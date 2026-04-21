import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Plus, Trash2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  ALTier, DEFAULT_RULE, loadRule, saveRule, applyRuleForYear,
  loadValuesForYear, daysForTenure, tenureYears, resetYear,
} from '../../utils/annualLeave';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Year currently viewed in Monthly Summary; used as default target year. */
  defaultYear: number;
  /** Employees to preview against + apply to. */
  employees: { id: string; name: string; joinDate: string; status?: string }[];
  /** Fires after rule changes or values are applied, so the parent can re-read storage. */
  onChanged: () => void;
}

export function AnnualLeaveSetup({ open, onOpenChange, defaultYear, employees, onChanged }: Props) {
  const [tiers, setTiers] = useState<ALTier[]>(() => loadRule());
  const [year, setYear] = useState(defaultYear);
  const [forceDialogOpen, setForceDialogOpen] = useState(false);

  const values = useMemo(() => loadValuesForYear(year), [year, open]);
  const countSet = Object.keys(values).length;

  // Preview: how many employees fall into each tier for the selected year.
  const preview = useMemo(() => {
    const asOf = new Date(year, 0, 1);
    const byDays = new Map<number, number>();
    employees
      .filter(e => !e.status || e.status === 'active')
      .filter(e => new Date(e.joinDate) <= asOf)
      .forEach(e => {
        const days = daysForTenure(tiers, tenureYears(e.joinDate, asOf));
        byDays.set(days, (byDays.get(days) ?? 0) + 1);
      });
    return Array.from(byDays.entries()).sort((a, b) => a[0] - b[0]);
  }, [tiers, employees, year]);

  const handleSaveRule = () => {
    const cleaned = normalizeTiers(tiers);
    if (!cleaned) {
      toast.error('Tiers must form a valid ascending range');
      return;
    }
    saveRule(cleaned);
    setTiers(cleaned);
    toast.success('AL rule saved');
    onChanged();
  };

  const handleApply = (force: boolean) => {
    const result = applyRuleForYear(year, employees, { force });
    onChanged();
    if (force) {
      toast.success(`AL reset for ${year} — ${result.updated} employees`);
    } else if (result.skipped > 0 && result.updated > 0) {
      toast.success(`Set ${result.updated}; kept ${result.skipped} already-set values`);
    } else if (result.skipped > 0) {
      toast.info(`All ${result.skipped} employees already have AL set for ${year}`);
    } else {
      toast.success(`Set AL for ${result.updated} employees in ${year}`);
    }
  };

  const handleResetYear = () => {
    resetYear(year);
    onChanged();
    toast.success(`AL values cleared for ${year}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Annual Leave Setup</DialogTitle>
            <DialogDescription>
              Configure the tenure-based rule, then apply it once per year to lock in each employee's AL quota.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="rule" className="space-y-4">
            <TabsList>
              <TabsTrigger value="rule">Rule</TabsTrigger>
              <TabsTrigger value="apply">
                Set for Year
                {countSet > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                    {countSet}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Rule tab */}
            <TabsContent value="rule" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Min years</TableHead>
                      <TableHead className="w-[30%]">Max years (exclusive)</TableHead>
                      <TableHead className="w-[30%]">Days per year</TableHead>
                      <TableHead className="w-[10%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((t, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={t.minYears}
                            onChange={(e) => updateTier(idx, { minYears: toInt(e.target.value, 0) })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            placeholder="∞"
                            value={t.maxYears === null ? '' : String(t.maxYears)}
                            onChange={(e) => updateTier(idx, { maxYears: e.target.value === '' ? null : toInt(e.target.value, 0) })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={t.daysPerYear}
                            onChange={(e) => updateTier(idx, { daysPerYear: toInt(e.target.value, 0) })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTier(idx)}
                            disabled={tiers.length <= 1}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={addTier}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Tier
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTiers(DEFAULT_RULE)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Reset to Defaults
                  </Button>
                  <Button size="sm" onClick={handleSaveRule}>
                    Save Rule
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3 bg-gray-50/50 space-y-2">
                <p className="text-xs font-medium text-gray-700">Preview — employees per tier for {year}</p>
                {preview.length === 0 ? (
                  <p className="text-xs text-gray-500">No active employees to evaluate for this year yet.</p>
                ) : (
                  <ul className="text-xs text-gray-700 space-y-1">
                    {preview.map(([days, count]) => (
                      <li key={days} className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{days} days</Badge>
                        <span>→ {count} employee{count !== 1 ? 's' : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            {/* Apply tab */}
            <TabsContent value="apply" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="al-year">Year</Label>
                  <Input
                    id="al-year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(toInt(e.target.value, defaultYear))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="h-9 flex items-center px-3 border rounded-md bg-gray-50 text-sm">
                    {countSet === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-gray-600">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        Not set for {year}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-green-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Set for {countSet} employee{countSet !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 bg-blue-50/40 text-sm text-blue-900 space-y-1">
                <p className="font-medium">Once per year semantics</p>
                <p className="text-xs text-blue-800">
                  <strong>Apply</strong> sets AL only for employees who don't already have a value for {year}.
                  Use <strong>Reset &amp; Re-apply</strong> if you changed the rule mid-year and need to overwrite.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                {countSet > 0 && (
                  <Button variant="outline" onClick={() => setForceDialogOpen(true)} className="text-red-700 border-red-200 hover:bg-red-50">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset &amp; Re-apply
                  </Button>
                )}
                <Button onClick={() => handleApply(false)}>
                  Apply for {year}
                </Button>
              </div>

              {countSet > 0 && (
                <div className="pt-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetYear}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Clear all AL values for {year}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force re-apply confirmation */}
      <AlertDialog open={forceDialogOpen} onOpenChange={setForceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite AL values for {year}?</AlertDialogTitle>
            <AlertDialogDescription>
              This overrides every employee's AL for {year} using the current rule. Existing balances (days already taken) stay the same, but quotas are recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { handleApply(true); setForceDialogOpen(false); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  function addTier() {
    const last = tiers[tiers.length - 1];
    const next: ALTier = {
      minYears: last?.maxYears ?? (last ? last.minYears + 1 : 0),
      maxYears: null,
      daysPerYear: last?.daysPerYear ?? 12,
    };
    setTiers([...tiers, next]);
  }
  function updateTier(idx: number, patch: Partial<ALTier>) {
    setTiers(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function removeTier(idx: number) {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== idx));
  }
}

function toInt(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Sort ascending by minYears and validate that tiers don't skip ranges unreasonably. */
function normalizeTiers(tiers: ALTier[]): ALTier[] | null {
  const sorted = [...tiers].sort((a, b) => a.minYears - b.minYears);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.minYears < 0) return null;
    if (t.daysPerYear < 0) return null;
    if (t.maxYears !== null && t.maxYears <= t.minYears) return null;
  }
  return sorted;
}
