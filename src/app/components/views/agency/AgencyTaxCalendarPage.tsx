import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Calendar, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import * as taxApi from '../../../api/agencyTax';
import type { CalendarEntry } from '../../../api/agencyTax';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { TaxCalendarTable } from './TaxCalendarTable';
import { MarkFiledDialog } from './MarkFiledDialog';

/**
 * v-agency-fe-3 — Cambodian tax calendar for the active client.
 * Requires a picked client (nav gate); shows the default period
 * window (last 3 months + current for monthly; last + current
 * year for annual) with mark-filed + overdue-sweep affordances.
 */
export function AgencyTaxCalendarPage() {
  const { activeClient, activeClientId } = useAgencyClient();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [markFor, setMarkFor] = useState<CalendarEntry | null>(null);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const list = await taxApi.agency.calendar(activeClientId);
      setEntries(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => { void load(); }, [load]);

  const sweep = async () => {
    if (!activeClientId) return;
    setSweeping(true);
    try {
      const res = await taxApi.agency.sweepOverdue(activeClientId);
      toast.success(`Sweep: ${res.opened} case(s) opened, ${res.skipped} skipped`);
      // No calendar refresh needed — sweep opens cases, not filing state.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sweep failed');
    } finally {
      setSweeping(false);
    }
  };

  // Group entries by frequency so the UI reads "monthly obligations,
  // then annual" — matches how Cambodian agencies think about the
  // calendar.
  const grouped = useMemo(() => {
    const monthly = entries.filter(e => e.frequency === 'monthly');
    const annual  = entries.filter(e => e.frequency === 'annual');
    return { monthly, annual };
  }, [entries]);

  if (!activeClientId) {
    return (
      <p className="text-center text-sm text-gray-500 py-16">
        Pick a client on the Portfolio page to view their tax calendar.
      </p>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Tax calendar — {activeClient?.tenantName ?? activeClient?.tenantSlug ?? ''}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cambodian statutory obligations for this client. Record a filing to
            mark it done; run the overdue sweep to auto-open cases for anything
            past its deadline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={sweep}
            disabled={sweeping || loading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {sweeping ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-1.5" />}
            Sweep overdue
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Monthly obligations</div>
          <div className="text-xs text-gray-500">
            TOS · PToI · VAT · WHT · Specific Tax due the 20th of the following month; NSSF the 15th.
          </div>
        </CardHeader>
        <CardContent>
          <TaxCalendarTable
            entries={grouped.monthly}
            onMarkFiled={setMarkFor}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Annual obligations</div>
          <div className="text-xs text-gray-500">
            Patent · CIT · Financial statements — 31 March following the tax year.
          </div>
        </CardHeader>
        <CardContent>
          <TaxCalendarTable
            entries={grouped.annual}
            onMarkFiled={setMarkFor}
          />
        </CardContent>
      </Card>

      <MarkFiledDialog
        open={!!markFor}
        onOpenChange={o => { if (!o) setMarkFor(null); }}
        side="agency"
        clientTenantId={activeClientId}
        entry={markFor}
        onSaved={() => void load()}
      />
    </div>
  );
}
