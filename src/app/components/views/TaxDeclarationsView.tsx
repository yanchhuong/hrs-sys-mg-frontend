import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { FileSpreadsheet, Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import * as declApi from '../../api/agencyTaxDecl';
import type { TaxDeclStatus, TaxDeclarationDto } from '../../api/agencyTaxDecl';
import { PageTitleTooltip } from './agency/PageTitleTooltip';
import { AgencyAccessDialog } from '../common/AgencyAccessDialog';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';
import { useAuth } from '../../context/AuthContext';

const STATUS_CLS: Record<TaxDeclStatus, string> = {
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  prepared:  'bg-blue-100 text-blue-700 border-blue-200',
  reviewed:  'bg-violet-100 text-violet-700 border-violet-200',
  approved:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  submitted: 'bg-teal-100 text-teal-700 border-teal-200',
  accepted:  'bg-lime-100 text-lime-700 border-lime-200',
  rejected:  'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * v-agency-fe-9 — tenant-side read of the tax declarations the
 * agency is producing on their behalf. Read-only — tenants don't
 * drive the state machine. Confirmed filings (status ≥ submitted)
 * also surface as filed rows on the Tax Calendar view.
 */
export function TaxDeclarationsView() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [rows, setRows] = useState<TaxDeclarationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await declApi.tenant.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load declarations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          Tax Declarations
          <PageTitleTooltip label="About Tax Declarations">
            Read-only view of the tax filings your agency is preparing.
            Green <b>"submitted"</b> or <b>"accepted"</b> rows have been
            lodged with GDT — the reference number is shown alongside.
          </PageTitleTooltip>
        </h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline" size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Agency access settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <AgencyAccessDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm text-gray-500">
            {rows.length} declaration{rows.length === 1 ? '' : 's'} on file
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <TableRowsSkeleton rows={6} columns={5} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nothing yet. Your agency's tax declarations will appear here as
              they're drafted.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => (
                <li key={r.id} className="py-3 px-1 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{r.obligationName}</span>
                      <span className="text-xs text-gray-500 tabular-nums">{r.period}</span>
                      <Badge className={`border ${STATUS_CLS[r.status]} text-[10px] px-1.5 py-0`}>
                        {r.status}
                      </Badge>
                      {r.gdtReferenceNo && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          GDT: {r.gdtReferenceNo}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-3">
                      <span className="tabular-nums">{r.amountOwed} {r.currency}</span>
                      {r.preparerName && <span>Prepared by {r.preparerName}</span>}
                      {r.approverName && <span>Approved by {r.approverName}</span>}
                      {r.submittedAt && <span>Submitted {new Date(r.submittedAt).toLocaleDateString()}</span>}
                      {r.acceptedAt && <span>Accepted {new Date(r.acceptedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
