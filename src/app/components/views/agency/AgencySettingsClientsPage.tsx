import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Building2, Loader2, RefreshCw, Search, Star, ScrollText, Check, X,
  FileText, Receipt as ReceiptIcon, Wallet,
} from 'lucide-react';
import { assignments as assignmentsApi } from '../../../api/agencyAdmin';
import type { AssignmentDto, AssignmentStatus, AllowedDataType } from '../../../api/agencyAdmin';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { useAuth } from '../../../context/AuthContext';
import { PageTitleTooltip } from './PageTitleTooltip';
import { TableRowsSkeleton } from '../../common/LoadingSkeletons';

type StatusTab = 'all' | AssignmentStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'all',                label: 'All' },
  { key: 'pending',            label: 'Pending' },
  { key: 'active',             label: 'Active' },
  { key: 'disconnect_pending', label: 'Disconnect' },
  { key: 'declined',           label: 'Declined' },
  { key: 'disengaged',         label: 'Disengaged' },
];

const STATUS_CLS: Record<AssignmentStatus, string> = {
  pending:            'bg-amber-100 text-amber-700 border-amber-200',
  active:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  declined:           'bg-rose-100 text-rose-700 border-rose-200',
  disengaged:         'bg-gray-100 text-gray-500 border-gray-200',
  disconnect_pending: 'bg-amber-200 text-amber-900 border-amber-300',
};

const SCOPE_CLS: Record<string, string> = {
  full:        'border-emerald-200 bg-emerald-50 text-emerald-700',
  tax:         'border-blue-200 bg-blue-50 text-blue-700',
  audit:       'border-violet-200 bg-violet-50 text-violet-700',
  bookkeeping: 'border-amber-200 bg-amber-50 text-amber-700',
};

/** Every doc type the model knows about — the chip row renders
 *  ALL of them, marking each as allowed (colored) or not (muted). */
const DATA_TYPES: Array<{ key: AllowedDataType; label: string; icon: React.ReactNode; allowedCls: string }> = [
  { key: 'invoice', label: 'Invoices', icon: <FileText className="h-3 w-3" />,    allowedCls: 'border-blue-200 bg-blue-50 text-blue-700' },
  { key: 'bill',    label: 'Bills',    icon: <ReceiptIcon className="h-3 w-3" />, allowedCls: 'border-orange-200 bg-orange-50 text-orange-700' },
  { key: 'expense', label: 'Expenses', icon: <Wallet className="h-3 w-3" />,      allowedCls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
];

/**
 * v-agency-clients-merged-tabs + v-agency-engagement-allowed-data-types
 *
 * Settings ▸ Clients. One table for every engagement — status is
 * a tab filter (All / Pending / Active / Declined / Disengaged),
 * not a separate section. Each row shows the client's allowed
 * data-type chips (Invoices / Bills / Expenses) so the agent
 * knows at a glance what they're permitted to read on that
 * client. Pending rows get a Review button that opens the
 * Accept/Decline dialog with Terms of Engagement.
 */
export function AgencySettingsClientsPage() {
  const { refresh: refreshPortfolio } = useAgencyClient();
  const { currentUser } = useAuth();
  const myRole = currentUser?.role?.replace(/^agency_/, '') ?? '';
  const canDecide = myRole === 'partner';

  const [rows, setRows] = useState<AssignmentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<AssignmentDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await assignmentsApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { all: rows.length, pending: 0, active: 0, declined: 0, disengaged: 0 };
    for (const r of rows) c[r.status as StatusTab] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (q && !(r.tenantName ?? '').toLowerCase().includes(q)
           && !(r.tenantSlug ?? '').toLowerCase().includes(q)
           && !r.scope.toLowerCase().includes(q)
           && !r.status.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  const onReviewClose = async (decided: boolean) => {
    setReviewing(null);
    if (decided) {
      await load();
      // Keep the header portfolio picker in sync when an accepted
      // engagement flips from pending → active.
      await refreshPortfolio();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Clients
          <PageTitleTooltip label="About Clients">
            Every engagement your agency has, across all statuses. Super
            Admin proposes engagements as <b>pending</b>; Partners review the
            Terms and either <b>Accept</b> (turns it active) or <b>Decline</b>.
            Each row shows the client's allowed data-type chips
            (Invoices / Bills / Expenses) — only accepted engagements
            with allowed chips unlock the client's data plane.
          </PageTitleTooltip>
        </h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="filter-strip">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              Engagements
              <span className="text-xs text-gray-500 font-normal">
                ({filtered.length}{search || tab !== 'all' ? ` of ${rows.length}` : ''})
              </span>
            </CardTitle>
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name / slug / scope / status…"
                className="pl-8 h-9 w-72 text-sm"
              />
            </div>
          </div>

          {/* Status tabs — All / Pending / Active / Declined / Disengaged */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {STATUS_TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 h-8 rounded-md border text-xs font-medium transition ${
                  tab === t.key
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {t.label}
                <span className="ml-1 text-[10px] opacity-70">({counts[t.key]})</span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="px-4 py-4"><TableRowsSkeleton rows={6} columns={5} /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-4">
              {rows.length === 0
                ? 'No engagements yet. Super Admin will land new proposals here for your review.'
                : 'No engagements match this filter.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map(a => {
                const allowed = new Set(a.allowedDataTypes);
                return (
                  <li key={a.id} className={`px-6 py-3 flex items-center gap-3 flex-wrap ${a.status === 'declined' || a.status === 'disengaged' ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate inline-flex items-center gap-1.5 flex-wrap">
                        {a.tenantName ?? a.tenantSlug ?? a.tenantId}
                        {a.isPrimary && (
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700 border text-[10px] px-1.5 py-0 inline-flex items-center gap-1">
                            <Star className="h-2.5 w-2.5" /> Primary
                          </Badge>
                        )}
                        <Badge className={`border text-[10px] px-1.5 py-0 ${STATUS_CLS[a.status]}`}>
                          {a.status}
                        </Badge>
                        <Badge className={`border text-[10px] px-1.5 py-0 ${SCOPE_CLS[a.scope] ?? ''}`}>
                          {a.scope}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-3">
                        <span>Proposed {new Date(a.createdAt).toLocaleDateString()}</span>
                        {a.decisionAt && (
                          <span>
                            {a.status === 'active' ? 'Accepted' : a.status === 'declined' ? 'Declined' : 'Decided'}
                            {' '}
                            {new Date(a.decisionAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {/* Allowed data-type chips — a full row so
                          the agent sees ALL doc types at a glance,
                          allowed vs muted. */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] uppercase text-gray-400 tracking-wide">Allowed:</span>
                        {DATA_TYPES.map(dt => {
                          const on = allowed.has(dt.key);
                          return (
                            <Badge
                              key={dt.key}
                              className={`border text-[10px] px-1.5 py-0 inline-flex items-center gap-1 ${
                                on ? dt.allowedCls : 'border-gray-200 bg-gray-50 text-gray-400 line-through'
                              }`}
                              title={on ? `${dt.label} allowed by the client` : `${dt.label} NOT allowed`}
                            >
                              {dt.icon} {dt.label}
                            </Badge>
                          );
                        })}
                        {a.allowedDataTypes.length === 0 && (
                          <span className="text-[10px] text-rose-600 font-medium">(client revoked all data)</span>
                        )}
                      </div>
                      {a.status === 'declined' && a.declineReason && (
                        <div className="mt-1 text-[11px] bg-rose-50/60 border border-rose-200 rounded px-2 py-1 text-rose-800">
                          <b>Declined:</b> {a.declineReason}
                        </div>
                      )}
                    </div>
                    {a.status === 'pending' && (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setReviewing(a)}
                        className="shrink-0"
                      >
                        <ScrollText className="h-3.5 w-3.5 mr-1.5" />
                        Review
                      </Button>
                    )}
                    {a.status === 'disconnect_pending' && canDecide && (
                      <Button
                        variant="outline" size="sm"
                        className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={async () => {
                          if (!confirm(
                            `Accept the client's disconnect request?\n\nThis ends the engagement — your agency will lose read access to ${a.tenantName ?? 'this Company'}'s data after Accept.`
                          )) return;
                          try {
                            await assignmentsApi.acceptDisconnect(a.id);
                            toast.success('Disconnect accepted — engagement ended.');
                            await load();
                            await refreshPortfolio();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Accept-disconnect failed');
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Accept disconnect
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ReviewProposalDialog
        proposal={reviewing}
        canDecide={canDecide}
        onClose={onReviewClose}
      />
    </div>
  );
}

/**
 * Review + Accept/Decline dialog. Requires the user to (a) scroll
 * to the bottom of the Terms and (b) tick "I have read and agree"
 * before the Accept button unlocks. Decline collects a required
 * reason so the audit trail explains why.
 */
function ReviewProposalDialog({ proposal, canDecide, onClose }: {
  proposal: AssignmentDto | null;
  canDecide: boolean;
  onClose: (decided: boolean) => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  useEffect(() => {
    if (!proposal) return;
    setAgreed(false);
    setDeclining(false);
    setReason('');
    setBusy(null);
    setScrolledEnd(!proposal.terms || proposal.terms.length < 400);
  }, [proposal]);

  if (!proposal) return null;

  const doAccept = async () => {
    setBusy('accept');
    try {
      await assignmentsApi.accept(proposal.id);
      toast.success('Engagement accepted. Client Company is now in your active portfolio.');
      onClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Accept failed');
    } finally {
      setBusy(null);
    }
  };

  const doDecline = async () => {
    if (!reason.trim()) return;
    setBusy('decline');
    try {
      await assignmentsApi.decline(proposal.id, reason.trim());
      toast.success('Engagement declined.');
      onClose(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Decline failed');
    } finally {
      setBusy(null);
    }
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) setScrolledEnd(true);
  };

  const canAccept = canDecide && agreed && scrolledEnd && busy == null;
  const allowed = new Set(proposal.allowedDataTypes);

  return (
    <Dialog open={!!proposal} onOpenChange={o => { if (!o) onClose(false); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-blue-600" />
            Review engagement
            <Badge className={`border text-[10px] px-1.5 py-0 ${SCOPE_CLS[proposal.scope] ?? ''}`}>
              {proposal.scope}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {proposal.tenantName ?? proposal.tenantSlug ?? proposal.tenantId}
            {proposal.isPrimary && ' · Primary'}
            {' · Proposed '}
            {new Date(proposal.createdAt).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
          {/* What data has the client allowed? */}
          <div>
            <div className="text-xs uppercase text-gray-500 font-medium mb-1.5">Client allows access to</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DATA_TYPES.map(dt => {
                const on = allowed.has(dt.key);
                return (
                  <Badge
                    key={dt.key}
                    className={`border text-[10px] px-1.5 py-0 inline-flex items-center gap-1 ${
                      on ? dt.allowedCls : 'border-gray-200 bg-gray-50 text-gray-400 line-through'
                    }`}
                  >
                    {dt.icon} {dt.label}
                  </Badge>
                );
              })}
              {proposal.allowedDataTypes.length === 0 && (
                <span className="text-[10px] text-rose-600 font-medium">(no data access granted)</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-gray-500 font-medium mb-1.5">Terms of Engagement</div>
            <div
              onScroll={onScroll}
              className="max-h-64 overflow-y-auto border rounded-md p-3 text-xs whitespace-pre-wrap bg-gray-50 text-gray-700"
            >
              {proposal.terms
                ? proposal.terms
                : <span className="italic text-gray-500">No terms attached to this proposal.</span>}
            </div>
            {proposal.terms && proposal.terms.length >= 400 && !scrolledEnd && (
              <p className="text-[10px] text-amber-700 mt-1">
                Scroll to the bottom of the Terms to unlock Accept.
              </p>
            )}
          </div>

          {!declining ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                disabled={!scrolledEnd}
              />
              I have read and agree to the Terms of Engagement above.
            </label>
          ) : (
            <div>
              <div className="text-xs uppercase text-gray-500 font-medium mb-1">Decline reason</div>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="text-sm"
                placeholder="Why is this engagement being declined? (recorded for audit)"
              />
            </div>
          )}

          {!canDecide && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              Only a Partner can accept or decline an engagement proposal.
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between gap-2 flex-wrap shrink-0">
          {declining ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDeclining(false)} disabled={busy !== null}>
                Back
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={doDecline}
                disabled={busy !== null || !reason.trim() || !canDecide}
              >
                {busy === 'decline'
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <X className="h-4 w-4 mr-1.5" />}
                Confirm Decline
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline" size="sm"
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
                onClick={() => setDeclining(true)}
                disabled={!canDecide || busy !== null}
              >
                <X className="h-4 w-4 mr-1.5" />
                Decline
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onClose(false)} disabled={busy !== null}>
                  Later
                </Button>
                <Button size="sm" onClick={doAccept} disabled={!canAccept}>
                  {busy === 'accept'
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <Check className="h-4 w-4 mr-1.5" />}
                  Accept
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
