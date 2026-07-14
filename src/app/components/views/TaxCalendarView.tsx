import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, RefreshCw } from 'lucide-react';
import * as taxApi from '../../api/agencyTax';
import type { CalendarEntry } from '../../api/agencyTax';
import { TaxCalendarTable } from './agency/TaxCalendarTable';
import { MarkFiledDialog } from './agency/MarkFiledDialog';

/**
 * v-agency-fe-3 — tenant-side tax calendar view. Same grid the
 * agency sees for this Company; tenant admins record their own
 * filings here.
 */
export function TaxCalendarView() {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [markFor, setMarkFor] = useState<CalendarEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await taxApi.tenant.calendar();
      setEntries(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => ({
    monthly: entries.filter(e => e.frequency === 'monthly'),
    annual:  entries.filter(e => e.frequency === 'annual'),
  }), [entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Tax calendar
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Your Cambodian tax obligations. Record a filing here after you submit;
            your agency sees the update automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Monthly obligations</div>
        </CardHeader>
        <CardContent>
          <TaxCalendarTable entries={grouped.monthly} onMarkFiled={setMarkFor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm font-semibold">Annual obligations</div>
        </CardHeader>
        <CardContent>
          <TaxCalendarTable entries={grouped.annual} onMarkFiled={setMarkFor} />
        </CardContent>
      </Card>

      <MarkFiledDialog
        open={!!markFor}
        onOpenChange={o => { if (!o) setMarkFor(null); }}
        side="tenant"
        entry={markFor}
        onSaved={() => void load()}
      />
    </div>
  );
}
