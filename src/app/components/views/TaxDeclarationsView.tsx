import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import {
  ListTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Pagination } from '../common/Pagination';
import { ListError } from '../common/ListStates';
import { usePagination } from '../../hooks/usePagination';
import { useDateFormat } from '../../context/DateFormatContext';
import { formatMoneyForCurrency } from '../../utils/format';
import { TONE_CLASS, type Tone } from '../../utils/statusTones';
import * as declApi from '../../api/agencyTaxDecl';
import type { TaxDeclStatus, TaxDeclarationDto } from '../../api/agencyTaxDecl';
import { PageTitleTooltip } from './agency/PageTitleTooltip';
import { AgencyAccessDialog } from '../common/AgencyAccessDialog';
import { TableRowsSkeleton } from '../common/LoadingSkeletons';
import { useAuth } from '../../context/AuthContext';

// App-wide status palette (utils/statusTones). "submitted" here means
// lodged with GDT, so it reads as done (green) like "accepted".
const STATUS_TONE: Record<TaxDeclStatus, Tone> = {
  draft:     'neutral',
  prepared:  'attention',
  reviewed:  'attention',
  approved:  'success',
  submitted: 'success',
  accepted:  'success',
  rejected:  'danger',
};

/** Amount in its own currency — "$1,200.00" / "៛ 4,800,000", as on Invoices. */
function fmtAmount(n: number | null | undefined, currency: string | null | undefined): string {
  const cur = currency || 'USD';
  const num = formatMoneyForCurrency(n, cur);
  return cur === 'USD' ? `$${num}` : cur === 'KHR' ? `៛ ${num}` : `${cur} ${num}`;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const { formatDate } = useDateFormat();
  const pagination = usePagination(rows, 15);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await declApi.tenant.list());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load declarations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="page-header-strip">
        <h1 className="text-3xl font-bold flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
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
          ) : loadError && rows.length === 0 ? (
            <ListError message={loadError} onRetry={() => void load()} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nothing yet. Your agency's tax declarations will appear here as
              they're drafted.
            </p>
          ) : (
            <>
              <ListTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obligation</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount Owed</TableHead>
                      <TableHead>GDT Ref.</TableHead>
                      <TableHead>Prepared / Approved</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Accepted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.paginatedItems.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium text-gray-900">{r.obligationName}</TableCell>
                        <TableCell className="text-xs text-gray-600 tabular-nums">{r.period}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TONE_CLASS[STATUS_TONE[r.status] ?? 'neutral']}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtAmount(r.amountOwed, r.currency)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{r.gdtReferenceNo || <span className="text-gray-300">—</span>}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {r.preparerName || r.approverName
                            ? [r.preparerName, r.approverName].filter(Boolean).join(' / ')
                            : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{r.submittedAt ? formatDate(r.submittedAt) : <span className="text-gray-300">—</span>}</TableCell>
                        <TableCell className="text-xs">{r.acceptedAt ? formatDate(r.acceptedAt) : <span className="text-gray-300">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </ListTable>
              {rows.length > 15 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    startIndex={pagination.startIndex}
                    endIndex={pagination.endIndex}
                    totalItems={pagination.totalItems}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
