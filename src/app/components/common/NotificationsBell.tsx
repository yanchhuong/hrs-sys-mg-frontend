import { lazy, Suspense, useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2, Megaphone, PartyPopper, Newspaper, CalendarHeart, Inbox, Stethoscope, CalendarClock, MessageCircle, ClipboardCheck, CircleCheck, CircleX, Send, ShoppingBag, Gift, Check, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button, PlainButton } from '../ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import * as api from '../../api/notifications';
import { TenantDocCommentDialog } from './TenantDocCommentDialog';
import type { PortfolioDocType } from '../../api/agencyPortfolioDocs';
import { updateAppBadge } from '../../utils/appBadge';
import { formatNotificationTime } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import * as approvalsApi from '../../api/approvals';
import { setOpenIntent } from '../../utils/openIntent';
import { Textarea } from '../ui/textarea';

// The full approval dialog lives with the (lazy) Approvals page; load it
// only when a notification actually opens one.
const ApprovalDetailDialog = lazy(() =>
  import('../views/Approvals').then(m => ({ default: m.ApprovalDetailDialog })));

/**
 * Where a notification row leads. Approvals open their full detail in
 * place (source preview, chain, Approve / Reject); everything else
 * switches to the owning page and, where that page supports it, opens
 * the record itself (utils/openIntent). Mobile maps the same entity
 * types in app/apps/notifications.tsx — keep the two in step.
 */
type Target =
  | { kind: 'approval'; chainId: string }
  | { kind: 'view'; view: string; id?: string };

function targetOf(n: api.Notification): Target | null {
  if (!n.entityType) return null;
  const t = n.entityType.toLowerCase();
  const id = n.entityId ?? undefined;
  if (t === 'approval') return id ? { kind: 'approval', chainId: id } : { kind: 'view', view: 'approvals' };
  if (/^(shop-order|pos-order|shop-spin)/.test(t) || t === 'pos_order') return { kind: 'view', view: 'pos' };
  if (t === 'tax_declaration') return { kind: 'view', view: 'tax-declarations' };
  if (t.includes('invoice'))   return { kind: 'view', view: 'invoices', id };
  if (t.includes('bill'))      return { kind: 'view', view: 'bills', id };
  if (t.includes('quotation')) return { kind: 'view', view: 'quotations', id };
  if (t.includes('voucher'))   return { kind: 'view', view: 'vouchers', id };
  if (t.includes('receipt') || t.includes('expense')) return { kind: 'view', view: 'receipts', id };
  if (t.includes('cash_advance') || t.includes('cashadvance')) return { kind: 'view', view: 'cash-advances', id };
  if (t.includes('leave'))     return { kind: 'view', view: 'all-leave', id };
  if (t.includes('overtime') || t.startsWith('ot-')) return { kind: 'view', view: 'overtime' };
  if (t.includes('encounter')) return { kind: 'view', view: 'encounters', id };
  if (t.includes('appointment')) return { kind: 'view', view: 'appointments' };
  if (t.includes('payroll'))   return { kind: 'view', view: 'payroll' };
  return null;
}

const DOC_TYPES = new Set<string>(['invoice', 'bill', 'expense']);

/**
 * Top-bar notification bell — sits between the AppLauncher and
 * LanguageSwitcher. Drops down a list of recent announcements the
 * user is in the audience for; unread items get a coloured dot +
 * inflate the badge count on the bell.
 *
 * <p>Polling is light-touch: fetch the unread count on mount + every
 * 60s, and a fresh list when the popover opens. No web-socket — the
 * announcement velocity in a typical tenant doesn't justify it.</p>
 */
export function NotificationsBell({ onNavigate }: {
  /** Switch the app to another view. Optional so the bell still
   *  renders standalone (e.g. in a shell that doesn't route), in
   *  which case an approval ping just marks itself read. */
  onNavigate?: (view: string) => void;
} = {}) {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  // v-agency-doc-comments-tenant-reply — when a doc-comment
  // notification is clicked, open the reply dialog scoped to
  // that Invoice / Bill / Expense.
  const [replyingTo, setReplyingTo] = useState<{ type: PortfolioDocType; id: string } | null>(null);
  /** Approval chains I take part in, by chain id — tells a row whether
   *  it is waiting on ME (Approve / Reject inline) or already settled. */
  const [chains, setChains] = useState<Map<string, approvalsApi.Approval>>(new Map());
  /** Approval opened in the full dialog (row click). */
  const [openApproval, setOpenApproval] = useState<approvalsApi.Approval | null>(null);

  const refreshCount = async () => {
    try { setUnread(await api.unreadCount()); } catch { /* soft-fail */ }
  };

  // The PWA app-icon badge mirrors whatever the bell shows. Driven off
  // `unread` itself rather than each mutation site, so polling, reading
  // one, mark-all-read and the dropdown-close re-sync all stay in step
  // without extra calls. updateAppBadge feature-detects and never
  // throws, so an unsupported platform is a no-op.
  useEffect(() => { void updateAppBadge(unread); }, [unread]);

  useEffect(() => {
    void refreshCount();

    // Real-time first, polling as the safety net (spec §14/§16).
    // The stream only pokes; refreshCount() re-reads the authoritative
    // number, so devices can never drift the way a local ++ would let
    // them. Polling stays on but drops to a slow heartbeat while the
    // stream is healthy, and returns to 60s if it drops — one timer
    // either way, never two.
    let disposeStream: (() => void) | null = null;
    let live = false;
    let timer = 0;

    const arm = (ms: number) => {
      window.clearInterval(timer);
      timer = window.setInterval(() => { void refreshCount(); }, ms);
    };
    arm(60_000);

    void api.subscribeToChanges(
      () => { live = true; arm(5 * 60_000); void refreshCount(); },
      () => { if (live) { live = false; arm(60_000); } },
    ).then(dispose => { disposeStream = dispose; });

    return () => {
      window.clearInterval(timer);
      disposeStream?.();
    };
  }, []);

  const loadChains = async () => {
    try {
      const rows = await approvalsApi.pending();
      setChains(new Map(rows.map(r => [r.chainId, r])));
    } catch { /* no approval access → rows just stay plain */ }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const list = await api.list();
      setItems(list);
      if (list.some(n => n.entityType === 'approval')) void loadChains();
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  const markOneRead = async (n: api.Notification) => {
    if (n.read) return;
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    setUnread(c => Math.max(0, c - 1));
    try { await api.markRead(n.kind, n.id); } catch { /* next refresh reconciles */ }
  };

  /** Inline decision from the row — the same call the Approvals page makes. */
  const decide = async (n: api.Notification, chainId: string, decision: 'approved' | 'rejected', comment?: string) => {
    const updated = await approvalsApi.decide(chainId, { decision, comment });
    setChains(prev => new Map(prev).set(chainId, updated));
    toast.success(decision === 'approved' ? 'Approved' : 'Rejected');
    void markOneRead(n);
  };

  // Fetch the dropdown content on open; counts can re-sync on close.
  useEffect(() => {
    if (open) void loadList();
    else      void refreshCount();
  }, [open]);

  const onItemClick = async (n: api.Notification) => {
    if (!n.read) {
      // Optimistic local update so the dropdown reads as "read"
      // immediately even before the network round-trip lands.
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(c => Math.max(0, c - 1));
      try { await api.markRead(n.kind, n.id); } catch (e) {
        // Rare — if it fails, the next refresh will reconcile.
        toast.error(e instanceof Error ? e.message : 'Could not mark as read');
      }
    }
    // v-agency-doc-comments-tenant-reply — if this ping is an
    // agency comment on a doc, open the tenant reply dialog so
    // the user can respond inline. Close the popover so the
    // dialog isn't hidden behind it.
    if (n.entityId && n.entityType && DOC_TYPES.has(n.entityType)) {
      setReplyingTo({ type: n.entityType as PortfolioDocType, id: n.entityId });
      setOpen(false);
      return;
    }
    // An approval ping is only useful if it takes you to the thing
    // you're being asked to decide — drop the user on the Approvals
    // inbox rather than leaving them to find it in the sidebar.
    // Public shop page activity (online / table orders, Spin & Win)
    // and counter orders all live on the POS page.
    const target = targetOf(n);
    if (!target) return;
    if (target.kind === 'approval') {
      // Open the chain in place — its dialog previews the source
      // document and carries Approve / Reject for the active approver.
      try {
        setOpenApproval(chains.get(target.chainId) ?? await approvalsApi.get(target.chainId));
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open this approval');
      }
      return;
    }
    if (!onNavigate) return;
    if (target.id) setOpenIntent(target.view, target.id);
    onNavigate(target.view);
    setOpen(false);
  };

  const onMarkAll = async () => {
    if (unread === 0) return;
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setUnread(0);
    try { await api.markAllRead(); } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark all as read');
      void loadList(); // resync on failure
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9"
          title="Notifications" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center
                             h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold
                             bg-red-600 text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-blue-600" /> Notifications
            {unread > 0 && (
              <span className="text-[11px] text-gray-500">({unread} unread)</span>
            )}
          </div>
          {unread > 0 && (
            <PlainButton type="button" onClick={() => onMarkAll()}
              className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
              <CheckCheck className="h-3 w-3" /> Mark all read
            </PlainButton>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading && (
            <div className="p-6 text-center text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-500">
              <Megaphone className="h-5 w-5 text-gray-300 mx-auto mb-1.5" />
              You're all caught up — no notifications.
            </div>
          )}
          {!loading && items.map(n => {
            const target = targetOf(n);
            const chain = n.entityType === 'approval' && n.entityId ? chains.get(n.entityId) : undefined;
            return (
            <div key={`${n.kind}:${n.id}`} role="button" tabIndex={0}
              onClick={() => void onItemClick(n)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void onItemClick(n); } }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-2.5 cursor-pointer
                          hover:bg-gray-50 transition-colors ${n.read ? '' : 'bg-blue-50/30'}`}>
              {/* Type-coloured leading icon — announcement palette
                  matches the Announcements list; V198 pings pick
                  their own doctor / calendar glyphs. */}
              <TypeIcon type={n.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {n.title}
                  </span>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5">{n.body}</div>
                {/* Actor ("You" when it's me) joins the time meta; omitted when null. */}
                {(n.publishAt || n.actorName) && (
                  <div className="text-[10px] text-gray-400 mt-1">
                    {[
                      n.actorName
                        ? (currentUser && n.actorUserId && String(currentUser.id) === n.actorUserId ? 'You' : n.actorName)
                        : null,
                      n.publishAt ? formatNotificationTime(n.publishAt) : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
                {chain && <ApprovalRowActions chain={chain} onDecide={(d, c) => decide(n, chain.chainId, d, c)} />}
              </div>
              {target && <ChevronRight className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" aria-hidden />}
            </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
    <TenantDocCommentDialog target={replyingTo} onClose={() => setReplyingTo(null)} />
    {openApproval && (
      <Suspense fallback={null}>
        <ApprovalDetailDialog
          approval={openApproval}
          onClose={() => setOpenApproval(null)}
          onChanged={() => { void loadChains(); }}
        />
      </Suspense>
    )}
    </>
  );
}

/**
 * Approve / Reject on an approval notification — only while the chain is
 * waiting on the viewer's step. Approve asks once more inline; Reject
 * asks for a reason (required, as on the Approvals page). Once settled
 * the row shows the outcome instead. Clicks never reach the row.
 */
function ApprovalRowActions({ chain, onDecide }: {
  chain: approvalsApi.Approval;
  onDecide: (decision: 'approved' | 'rejected', comment?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (chain.viewerRole !== 'active') {
    const label = chain.status === 'approved' || chain.status === 'auto_approved' ? 'Approved'
      : chain.status === 'rejected' ? 'Rejected'
      : chain.viewerRole === 'waiting' ? 'Waiting for an earlier approver'
      : 'Decision recorded · in progress';
    const tone = chain.status === 'rejected' ? 'text-rose-700 bg-rose-50'
      : chain.status === 'pending' ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50';
    return <div className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{label}</div>;
  }

  const run = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !reason.trim()) { toast.error('Please add a reason before rejecting.'); return; }
    setBusy(true);
    try { await onDecide(decision, decision === 'rejected' ? reason.trim() : undefined); setMode('idle'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 space-y-1.5" onClick={stop} onKeyDown={stop}>
      {mode === 'reject' && (
        <Textarea autoFocus rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason for rejecting (required)…" className="text-xs min-h-0" />
      )}
      <div className="flex items-center gap-1.5">
        {mode === 'idle' && (<>
          <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => setMode('approve')}>
            <Check className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-red-700 border-red-200 hover:bg-red-50" onClick={() => setMode('reject')}>
            <X className="h-3.5 w-3.5 mr-1" /> Reject
          </Button>
        </>)}
        {mode !== 'idle' && (<>
          <span className="text-[11px] text-gray-600 mr-auto">{mode === 'approve' ? 'Approve this request?' : 'Reject with this reason?'}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => { setMode('idle'); setReason(''); }}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy}
            className={`h-7 px-2.5 text-xs ${mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
            onClick={() => run(mode === 'approve' ? 'approved' : 'rejected')}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>)}
      </div>
    </div>
  );
}

function TypeIcon({ type }: { type: api.NotificationType }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  // Cast — BE ships strings the FE enum doesn't statically list
  // (e.g. 'doc_comment' from V233); the string is compared here
  // as a plain value so unknown types just fall through to Inbox.
  switch (type as string) {
    case 'HOLIDAY':              return <PartyPopper   className={`${cls} text-rose-600`} />;
    case 'NEWS':                 return <Newspaper     className={`${cls} text-blue-600`} />;
    case 'EVENTS':               return <CalendarHeart className={`${cls} text-purple-600`} />;
    case 'encounter_assigned':   return <Stethoscope   className={`${cls} text-emerald-600`} />;
    case 'appointment_assigned': return <CalendarClock className={`${cls} text-emerald-600`} />;
    case 'doc_comment':          return <MessageCircle className={`${cls} text-blue-600`} />;
    case 'approval_requested':   return <ClipboardCheck className={`${cls} text-amber-600`} />;
    case 'approval_approved':    return <CircleCheck   className={`${cls} text-emerald-600`} />;
    case 'approval_rejected':    return <CircleX       className={`${cls} text-rose-600`} />;
    case 'reminder_sent':        return <Send          className={`${cls} text-sky-600`} />;
    case 'shop-order-created':
    case 'pos-order-created':    return <ShoppingBag   className={`${cls} text-emerald-600`} />;
    case 'shop-spin-won':
    case 'shop-spin-claimed':    return <Gift          className={`${cls} text-pink-600`} />;
    case 'OTHERS':
    default:                     return <Inbox         className={`${cls} text-gray-500`} />;
  }
}
