import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Plus, Trash2, Save, RotateCcw, Info, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import * as settingsApi from '../../api/settings';
import { USE_MOCKS } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Props {
  embedded?: boolean;
}

interface BracketRow {
  /** Local id for stable React keys before save (UUID from backend after). */
  key: string;
  id?: string;
  fromAmount: number;
  /** null = open-ended top bracket. */
  toAmount: number | null;
  ratePercent: number;
  excessAmount: number;
}

const NBC_DEFAULT_BRACKETS: Omit<BracketRow, 'key'>[] = [
  { fromAmount: 0,        toAmount: 1500000,  ratePercent: 0,  excessAmount: 0       },
  { fromAmount: 1500001,  toAmount: 2000000,  ratePercent: 5,  excessAmount: 75000   },
  { fromAmount: 2000001,  toAmount: 8500000,  ratePercent: 10, excessAmount: 175000  },
  { fromAmount: 8500001,  toAmount: 12500000, ratePercent: 15, excessAmount: 600000  },
  { fromAmount: 12500001, toAmount: null,     ratePercent: 20, excessAmount: 1225000 },
];

const seedKey = (() => {
  let n = 0;
  return () => `local-${++n}`;
})();

const fmtKhr = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US') : '';

export function TaxBrackets({ embedded = false }: Props = {}) {
  const { canUpdate } = useAuth();
  const canEdit = canUpdate('settings');

  const [khrPerUsd, setKhrPerUsd] = useState<number>(4100);
  const [rows, setRows] = useState<BracketRow[]>(
    NBC_DEFAULT_BRACKETS.map(b => ({ ...b, key: seedKey() })),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Test-formula playground at the bottom of the page.
  const [testSalaryUsd, setTestSalaryUsd] = useState<number>(800);

  useEffect(() => {
    if (USE_MOCKS) return;
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getPayrollTaxSettings();
      setKhrPerUsd(Number(data.khrPerUsd));
      setRows(data.brackets.map(b => ({
        key: seedKey(),
        id: b.id,
        fromAmount: Number(b.fromAmount),
        toAmount: b.toAmount == null ? null : Number(b.toAmount),
        ratePercent: Number(b.ratePercent),
        excessAmount: Number(b.excessAmount),
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tax settings');
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (key: string, patch: Partial<BracketRow>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, {
      key: seedKey(),
      fromAmount: last ? (Number(last.toAmount) || Number(last.fromAmount)) + 1 : 0,
      toAmount: null,
      ratePercent: 0,
      excessAmount: 0,
    }]);
  };

  const removeRow = (key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const validate = (): string | null => {
    if (rows.length === 0) return 'Add at least one bracket.';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Number.isFinite(r.fromAmount) || r.fromAmount < 0) {
        return `Row ${i + 1}: From must be a number ≥ 0.`;
      }
      if (r.toAmount != null && r.toAmount <= r.fromAmount) {
        return `Row ${i + 1}: To must be greater than From.`;
      }
      if (r.toAmount == null && i !== rows.length - 1) {
        return `Only the last row may be open-ended (no upper bound).`;
      }
      if (!Number.isFinite(r.ratePercent) || r.ratePercent < 0 || r.ratePercent > 100) {
        return `Row ${i + 1}: Rate must be 0..100.`;
      }
    }
    if (!(khrPerUsd > 0)) return 'KHR per USD must be greater than 0.';
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      if (USE_MOCKS) {
        toast.success('Saved (mock)');
        setSaving(false);
        return;
      }
      const data = await settingsApi.updatePayrollTaxSettings({
        khrPerUsd,
        brackets: rows.map((r, i) => ({
          id: r.id,
          fromAmount: r.fromAmount,
          toAmount: r.toAmount,
          ratePercent: r.ratePercent,
          excessAmount: r.excessAmount,
          sortOrder: i + 1,
        })),
      });
      setKhrPerUsd(Number(data.khrPerUsd));
      setRows(data.brackets.map(b => ({
        key: seedKey(),
        id: b.id,
        fromAmount: Number(b.fromAmount),
        toAmount: b.toAmount == null ? null : Number(b.toAmount),
        ratePercent: Number(b.ratePercent),
        excessAmount: Number(b.excessAmount),
      })));
      toast.success('Tax settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save tax settings');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (USE_MOCKS) {
      setRows(NBC_DEFAULT_BRACKETS.map(b => ({ ...b, key: seedKey() })));
      setKhrPerUsd(4100);
      setResetOpen(false);
      toast.success('Reset to NBC defaults (mock)');
      return;
    }
    try {
      const data = await settingsApi.resetPayrollTaxDefaults();
      // Pull both the brackets and the FX rate from the response — the
      // backend resets both so the UI must mirror that to avoid showing
      // a stale rate after a "factory reset".
      setKhrPerUsd(Number(data.khrPerUsd));
      setRows(data.brackets.map(b => ({
        key: seedKey(),
        id: b.id,
        fromAmount: Number(b.fromAmount),
        toAmount: b.toAmount == null ? null : Number(b.toAmount),
        ratePercent: Number(b.ratePercent),
        excessAmount: Number(b.excessAmount),
      })));
      toast.success('Reset to NBC defaults');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setResetOpen(false);
    }
  };

  // Live preview of the formula on a sample USD salary so HR can sanity-check
  // changes before saving. Pure math; no side effects.
  const taxPreview = (() => {
    const monthlyKhr = testSalaryUsd * khrPerUsd;
    const sorted = [...rows].sort((a, b) => a.fromAmount - b.fromAmount);
    const bracket = sorted.find(r => monthlyKhr >= r.fromAmount && (r.toAmount == null || monthlyKhr <= r.toAmount));
    if (!bracket) return null;
    const taxKhr = Math.max(0, (monthlyKhr * bracket.ratePercent / 100) - bracket.excessAmount);
    return {
      monthlyKhr,
      bracket,
      taxKhr,
      taxUsd: khrPerUsd > 0 ? taxKhr / khrPerUsd : 0,
    };
  })();

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold">Tax Brackets</h1>
        </div>
      )}

      {/* FX rate row + formula reminder. The KHR/USD field is the only piece
          of cross-row state; brackets are evaluated per-row using it. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            Exchange rate &amp; formula
          </CardTitle>
          <CardDescription>
            Tax Payable = (Monthly Salary in KHR × Tax Rate) − Excess Amount.
            Salaries stored in USD are converted to KHR using the rate below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="khrPerUsd" className="text-xs">KHR per 1 USD (NBC)</Label>
              <Input
                id="khrPerUsd"
                type="number"
                min={0}
                step="0.0001"
                disabled={!canEdit || loading}
                value={khrPerUsd}
                onChange={e => setKhrPerUsd(Number(e.target.value))}
                className="w-40 h-9"
              />
            </div>
            <p className="text-xs text-gray-500 max-w-md">
              Update monthly when NBC publishes the new rate. All bracket
              comparisons happen in KHR — keep this in sync to avoid
              under/over-taxing on USD-paid employees.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bracket table editor. Add / remove rows freely; the last row is the
          only one allowed to be open-ended (To = blank). */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Brackets (KHR)</CardTitle>
              <CardDescription>
                Progressive monthly-income tax bands. Default values match
                the NBC schedule.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={!canEdit || saving}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to NBC
              </Button>
              <Button variant="outline" size="sm" onClick={addRow} disabled={!canEdit || saving}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add bracket
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>From (KHR)</TableHead>
                <TableHead>To (KHR)</TableHead>
                <TableHead className="w-28">Rate (%)</TableHead>
                <TableHead>Excess (KHR)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                    No brackets — click "Reset to NBC" or "Add bracket".
                  </TableCell>
                </TableRow>
              ) : rows.map((r, i) => {
                const isLast = i === rows.length - 1;
                return (
                  <TableRow key={r.key}>
                    <TableCell className="text-sm text-gray-500">{i + 1}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        disabled={!canEdit || saving}
                        value={r.fromAmount}
                        onChange={e => updateRow(r.key, { fromAmount: Number(e.target.value) })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        disabled={!canEdit || saving}
                        placeholder={isLast ? 'Open-ended' : ''}
                        value={r.toAmount == null ? '' : r.toAmount}
                        onChange={e => updateRow(r.key, {
                          toAmount: e.target.value === '' ? null : Number(e.target.value),
                        })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        disabled={!canEdit || saving}
                        value={r.ratePercent}
                        onChange={e => updateRow(r.key, { ratePercent: Number(e.target.value) })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        disabled={!canEdit || saving}
                        value={r.excessAmount}
                        onChange={e => updateRow(r.key, { excessAmount: Number(e.target.value) })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        disabled={!canEdit || saving || rows.length <= 1}
                        onClick={() => removeRow(r.key)}
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end mt-4 gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
              Reload
            </Button>
            <Button size="sm" onClick={save} disabled={!canEdit || saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live calc preview. Pure UI helper — doesn't write anything. Lets HR
          plug in a sample USD salary and see exactly which bracket applies
          and what the resulting TOS would be. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-600" />
            Try the formula
          </CardTitle>
          <CardDescription>
            Enter a sample monthly salary in USD to verify the configured
            brackets produce the expected TOS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="testSalary" className="text-xs">Monthly salary (USD)</Label>
              <Input
                id="testSalary"
                type="number"
                min={0}
                step="1"
                value={testSalaryUsd}
                onChange={e => setTestSalaryUsd(Number(e.target.value))}
                className="w-40 h-9"
              />
            </div>
            <div className="text-sm text-gray-700">
              {taxPreview ? (
                <div className="flex flex-col gap-0.5">
                  <span>
                    Monthly KHR: <span className="font-medium">{fmtKhr(taxPreview.monthlyKhr)}</span>
                  </span>
                  <span>
                    Bracket: <span className="font-medium">{taxPreview.bracket.ratePercent}%</span>
                    , excess <span className="font-medium">{fmtKhr(taxPreview.bracket.excessAmount)}</span>
                  </span>
                  <span>
                    Tax: <span className="font-medium text-red-600">
                      ≈ {fmtKhr(Math.round(taxPreview.taxKhr))} KHR
                    </span>
                    {' '}
                    (<span className="font-medium">${taxPreview.taxUsd.toFixed(2)}</span>)
                  </span>
                </div>
              ) : (
                <span className="text-gray-400">No bracket matched — check the table covers this income.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to NBC defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current brackets with the canonical Cambodian
              TOS schedule (5 rows, 0–20% bands) and resets the KHR/USD rate
              to 4,100. Update the rate to the current NBC mid-month figure
              afterwards. Your existing bracket rows will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetDefaults}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
