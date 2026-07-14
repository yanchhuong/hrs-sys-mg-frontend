import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { AlertOctagon, FileSearch, Loader2, ShieldAlert, TrendingUp, Copy } from 'lucide-react';
import * as hooksApi from '../../../api/agencyHooks';
import type { SweepResult } from '../../../api/agencyHooks';
import { useAgencyClient } from '../../../context/AgencyClientContext';

interface Sweep {
  key: 'missing-docs' | 'anomalies';
  title: string;
  description: string;
  icon: JSX.Element;
  rules: string[];
  run: (clientTenantId: string) => Promise<SweepResult>;
}

const SWEEPS: Sweep[] = [
  {
    key: 'missing-docs',
    title: 'Missing source documents',
    description:
      'Sweeps invoices / bills / receipts posted without an attached source. '
      + 'One missing_doc case per orphan, 8h SLA.',
    icon: <FileSearch className="h-5 w-5 text-amber-600" />,
    rules: [
      'Invoice / bill / receipt with no attachment',
      'Skips void invoices',
      'Idempotent — dedup on (doc, missing_doc, open)',
    ],
    run: hooksApi.sweepMissingDocs,
  },
  {
    key: 'anomalies',
    title: 'Bookkeeping anomalies',
    description:
      'Three cheap heuristics on bills — catches the classic errors '
      + 'without a full baseline model. One correction case per flagged bill.',
    icon: <TrendingUp className="h-5 w-5 text-rose-600" />,
    rules: [
      'Duplicate — same vendor + amount + date within 7 days',
      'Round-thousand — total ≥ 1000 AND divisible by 1000',
      'High-value one-off — total > 3× vendor trailing-90d mean',
    ],
    run: hooksApi.sweepAnomalies,
  },
];

/**
 * v-agency-fe-4 — anomaly / missing-doc sweep console.
 *
 * <p>Each card fires an idempotent sweep on the picked client. The
 * BE opens cases for anything the rule catches; the operator sees
 * the flagged items in the Cases inbox after the run. Re-running
 * skips docs that already have an open case for the same reason.</p>
 */
export function AgencyAnomaliesPage() {
  const { activeClient, activeClientId } = useAgencyClient();
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SweepResult | undefined>>({});

  if (!activeClientId) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">
        Pick a client on the Portfolio page to run anomaly sweeps.
      </p>
    );
  }

  const runOne = async (s: Sweep) => {
    setRunning(r => ({ ...r, [s.key]: true }));
    try {
      const res = await s.run(activeClientId);
      setResults(rs => ({ ...rs, [s.key]: res }));
      toast.success(`${s.title}: ${res.opened} case(s) opened, ${res.skipped} skipped`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sweep failed');
    } finally {
      setRunning(r => ({ ...r, [s.key]: false }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-blue-600" />
          Anomaly sweep — {activeClient?.tenantName ?? activeClient?.tenantSlug ?? ''}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Run compliance / bookkeeping checks against the client's data. Any hit
          auto-opens a case — head to <span className="font-medium">Cases</span> to
          review. Sweeps are idempotent, safe to re-run daily.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SWEEPS.map(s => {
          const result = results[s.key];
          const busy = running[s.key];
          return (
            <Card key={s.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {s.icon}
                  {s.title}
                </CardTitle>
                <div className="text-xs text-gray-500 mt-1">{s.description}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-xs text-gray-600 space-y-1">
                  {s.rules.map(r => (
                    <li key={r} className="flex items-start gap-1.5">
                      <Copy className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                {result && (
                  <div className={`rounded-md border px-3 py-2 text-xs flex items-center gap-2 ${
                    result.opened > 0
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}>
                    {result.opened > 0
                      ? <AlertOctagon className="h-3.5 w-3.5" />
                      : <ShieldAlert className="h-3.5 w-3.5" />}
                    <span>
                      Last run: <b>{result.opened}</b> case{result.opened === 1 ? '' : 's'} opened,{' '}
                      <b>{result.skipped}</b> skipped.
                    </span>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button size="sm" onClick={() => runOne(s)} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1.5" />}
                    Run sweep
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1 pt-1 border-t">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Idempotent</Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">System-generated case</Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Bell ping to tenant admins</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
