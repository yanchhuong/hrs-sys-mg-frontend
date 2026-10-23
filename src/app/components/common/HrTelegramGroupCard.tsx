import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Users, Loader2, Copy, Check, Plus, Unlink, X } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import * as groupApi from '../../api/hrTelegramGroup';
import type { HrTelegramBot } from '../../api/hrTelegramBots';

type Group = groupApi.HrTelegramGroup;
type EventKey = 'postInvoices' | 'postExpenses' | 'postApprovals' | 'postCashAdvance' | 'postActivity'
  | 'postAttendance' | 'postOvertime' | 'postLeave' | 'postPayroll' | 'postEmployee';

/** Each event is offered only when at least one of its modules is
 *  available to the tenant (declared + enabled). */
const EVENTS: { key: EventKey; label: string; modules: string[] }[] = [
  { key: 'postInvoices',    label: 'Invoices',               modules: ['invoice'] },
  { key: 'postExpenses',    label: 'Expenses & Bills',       modules: ['expenses', 'bill'] },
  { key: 'postApprovals',   label: 'Approvals',              modules: ['approval'] },
  { key: 'postCashAdvance', label: 'Cash advance & Voucher', modules: ['cashadvance', 'voucher'] },
  { key: 'postActivity',    label: 'Activities',             modules: ['reading'] },
  { key: 'postAttendance',  label: 'Attendance',             modules: ['attendance'] },
  { key: 'postOvertime',    label: 'Overtime',               modules: ['overtime'] },
  { key: 'postLeave',       label: 'Leave',                  modules: ['all-leave'] },
  { key: 'postPayroll',     label: 'Payroll',                modules: ['payroll'] },
  { key: 'postEmployee',    label: 'Employees',              modules: ['employees'] },
];

const POLL_MS = 5000;
/** Stop polling this long after a code appears — the admin either sent
 *  `/link` by then or wandered off; "Check again" restarts it. */
const POLL_WINDOW_MS = 5 * 60_000;

interface Props {
  /** The tenant's HR bot (null = not registered). The card is disabled
   *  until a bot exists — group links are redeemed by that bot. */
  bot: HrTelegramBot | null;
  /** Whether the host dialog/page is open; polling only runs while true. */
  active: boolean;
}

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function expiryOf(g: Group): number {
  return g.linkCodeExpiresAt ? new Date(g.linkCodeExpiresAt).getTime() : NaN;
}

/** Pending row whose code is still redeemable (unknown expiry counts as live). */
function isLivePending(g: Group, now = Date.now()): boolean {
  if (g.linked || !g.linkCode) return false;
  const exp = expiryOf(g);
  return isNaN(exp) || now < exp;
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * "Team group" card — connects one or more Telegram groups where the HR
 * bot posts team activity, each with its own "Posts" tags. Flow:
 * Add group → server mints a pending row with a `/link CODE` → admin
 * sends it in the group → card polls GET every 5 s (only while a live
 * code exists, tab visible, for at most 5 min) until the row is linked.
 * Tags save on add/remove (pending rows can be preset); only events whose
 * module the tenant has are shown.
 */
export function HrTelegramGroupCard({ bot, active }: Props) {
  const confirm = useConfirm();
  const { isModuleAvailable } = useAuth();
  const disabled = !bot;
  /** Events this tenant can actually produce; hidden ones keep their
   *  server value untouched — they're just never rendered. */
  const availableEvents = EVENTS.filter(ev => ev.modules.some(m => isModuleAvailable(m)));

  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Bumped by "Check again" / new codes to restart the poll window. */
  const [pollRound, setPollRound] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [, forceTick] = useState(0);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const setBusyFor = (id: string, v: boolean) =>
    setBusy(prev => {
      const next = { ...prev };
      if (v) next[id] = true; else delete next[id];
      return next;
    });

  const patchGroup = useCallback((next: Group) => {
    setGroups(prev => (prev ? prev.map(g => (g.id === next.id ? next : g)) : prev));
  }, []);

  /** Replace the list with a server snapshot and announce pending rows
   *  that got linked (or merged into an already-connected group). */
  const applyList = useCallback((next: Group[], announce: boolean) => {
    const prev = groupsRef.current ?? [];
    if (announce) {
      const byId = new Map(next.map(g => [g.id, g]));
      const now = Date.now();
      for (const old of prev) {
        if (old.linked) continue;
        const cur = byId.get(old.id);
        if (cur?.linked) {
          toast.success(cur.title ? `Connected to «${cur.title}»` : 'Team group connected');
        } else if (!cur && isLivePending(old, now)) {
          toast.info('That Telegram group was already connected — the existing connection was kept.');
        }
      }
    }
    groupsRef.current = next;
    setGroups(next);
  }, []);

  // Initial load (re-run each time the host opens).
  useEffect(() => {
    if (!active || disabled) return;
    let cancelled = false;
    setLoading(true);
    groupApi.listGroups()
      .then(list => { if (!cancelled) applyList(list, false); })
      .catch(e => toast.error(errMsg(e, 'Failed to load team groups')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, disabled, applyList]);

  const now = Date.now();
  const hasLivePending = !!groups?.some(g => isLivePending(g, now));

  // Re-render at the next code-expiry instant so rows flip to "expired"
  // and polling stops once no live code remains.
  const nextExpiry = (groups ?? [])
    .filter(g => isLivePending(g, now))
    .map(expiryOf)
    .filter(ms => !isNaN(ms))
    .reduce((a, b) => Math.min(a, b), Infinity);
  useEffect(() => {
    if (!isFinite(nextExpiry)) return;
    const t = window.setTimeout(
      () => forceTick(n => n + 1),
      Math.min(Math.max(nextExpiry - Date.now() + 50, 0), 2 ** 31 - 1),
    );
    return () => window.clearTimeout(t);
  }, [nextExpiry]);

  // Poll only while at least one pending group has a live code; stop once
  // none remain or the window runs out. Ticks are skipped while hidden.
  useEffect(() => {
    if (!active || disabled || !hasLivePending) return;
    setPollTimedOut(false);
    const deadline = Date.now() + POLL_WINDOW_MS;
    let cancelled = false;
    let inFlight = false;
    const id = window.setInterval(() => {
      if (!(groupsRef.current ?? []).some(g => isLivePending(g))) { window.clearInterval(id); return; }
      if (Date.now() >= deadline) { window.clearInterval(id); setPollTimedOut(true); return; }
      if (document.hidden || inFlight) return;
      inFlight = true;
      groupApi.listGroups()
        .then(list => { if (!cancelled) applyList(list, true); })
        .catch(() => { /* transient — next tick retries */ })
        .finally(() => { inFlight = false; });
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [active, disabled, hasLivePending, pollRound, applyList]);

  const checkAgain = () => {
    groupApi.listGroups().then(list => applyList(list, true)).catch(() => {});
    setPollRound(n => n + 1);
  };

  const addGroup = async () => {
    setAdding(true);
    try {
      const g = await groupApi.addGroup();
      setGroups(prev => {
        const next = [...(prev ?? []).filter(x => x.id !== g.id), g];
        groupsRef.current = next;
        return next;
      });
      setPollRound(n => n + 1);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to add group'));
    } finally {
      setAdding(false);
    }
  };

  const newCode = async (g: Group) => {
    setBusyFor(g.id, true);
    try {
      patchGroup(await groupApi.createLinkCode(g.id));
      setCopiedId(c => (c === g.id ? null : c));
      setPollRound(n => n + 1);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to create link code'));
    } finally {
      setBusyFor(g.id, false);
    }
  };

  const removeGroup = (id: string) =>
    setGroups(prev => {
      const next = prev ? prev.filter(x => x.id !== id) : prev;
      groupsRef.current = next;
      return next;
    });

  const disconnect = async (g: Group) => {
    const ok = await confirm({
      title: 'Disconnect team group?',
      message: `The HR bot will stop posting to «${g.title ?? 'this group'}».`,
      confirmLabel: 'Disconnect',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyFor(g.id, true);
    try {
      await groupApi.deleteGroup(g.id);
      removeGroup(g.id);
      toast.success('Team group disconnected');
    } catch (e) {
      toast.error(errMsg(e, 'Failed to disconnect group'));
    } finally {
      setBusyFor(g.id, false);
    }
  };

  const cancelPending = async (g: Group) => {
    setBusyFor(g.id, true);
    try {
      await groupApi.deleteGroup(g.id);
      removeGroup(g.id);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to cancel'));
    } finally {
      setBusyFor(g.id, false);
    }
  };

  const toggle = async (gid: string, key: EventKey, value: boolean) => {
    const set = (v: boolean) =>
      setGroups(prev => (prev ? prev.map(g => (g.id === gid ? { ...g, [key]: v } : g)) : prev));
    set(value);
    try {
      await groupApi.updateEvents(gid, { [key]: value });
    } catch (e) {
      set(!value);
      toast.error(errMsg(e, 'Failed to save setting'));
    }
  };

  const copyCommand = async (g: Group) => {
    if (!g.linkCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${g.linkCode}`);
      setCopiedId(g.id);
      window.setTimeout(() => setCopiedId(c => (c === g.id ? null : c)), 1500);
    } catch {
      toast.error('Copy failed — select the command and copy it manually');
    }
  };

  /** "Posts" tag editor: enabled (and available) events as removable
   *  pills, plus a "+ Add" menu for the available ones still off. */
  const renderTags = (g: Group) => {
    const on = availableEvents.filter(ev => g[ev.key]);
    const off = availableEvents.filter(ev => !g[ev.key]);
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Posts</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {on.length === 0 && (
            <span className="text-xs text-gray-500 mr-1">Nothing posts yet — add activities</span>
          )}
          {on.map(ev => (
            <span
              key={ev.key}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 pl-2.5 pr-1 py-0.5 text-xs text-sky-800"
            >
              {ev.label}
              <button
                type="button"
                aria-label={`Remove ${ev.label}`}
                className="rounded-full p-0.5 text-sky-600 hover:bg-sky-100 hover:text-sky-900"
                onClick={() => toggle(g.id, ev.key, false)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {off.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-gray-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {off.map(ev => (
                  <DropdownMenuItem key={ev.key} onSelect={() => toggle(g.id, ev.key, true)}>
                    {ev.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  };

  const renderLinked = (g: Group) => {
    const isBusy = !!busy[g.id];
    return (
      <div key={g.id} className="rounded-md border px-3 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm min-w-0 truncate">
            ✅ <span className="font-medium">«{g.title ?? 'Telegram group'}»</span>
            {g.linkedAt && <span className="text-[11px] text-gray-500"> · since {fmtDate(g.linkedAt)}</span>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-red-700 hover:bg-red-50 hover:text-red-800 shrink-0"
            onClick={() => disconnect(g)}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Unlink className="h-3.5 w-3.5 mr-1" />}
            Disconnect
          </Button>
        </div>
        {renderTags(g)}
      </div>
    );
  };

  const renderPending = (g: Group) => {
    const isBusy = !!busy[g.id];
    const exp = expiryOf(g);
    const codeExpired = !isNaN(exp) && now >= exp;
    const copied = copiedId === g.id;
    return (
      <div key={g.id} className="rounded-md border px-3 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700 min-w-0 truncate">New group — waiting for /link</span>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant={codeExpired ? 'outline' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => newCode(g)}
              disabled={isBusy}
            >
              {isBusy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              New code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-gray-600"
              onClick={() => cancelPending(g)}
              disabled={isBusy}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
        <div className="bg-slate-50 border rounded-md px-3 py-2.5 space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Add the HR bot{bot?.botUsername && <> (<span className="font-medium">@{bot.botUsername}</span>)</>} to your Telegram group.
            </li>
            <li>
              In the group, send:
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-white border px-2 py-1 font-mono text-sm select-all">/link {g.linkCode}</code>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => copyCommand(g)}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </li>
            <li>
              Wait a moment — this card will show the group name.
              {!codeExpired && !pollTimedOut && <Loader2 className="h-3.5 w-3.5 ml-1.5 animate-spin text-gray-400 inline" />}
              {!codeExpired && pollTimedOut && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 ml-1.5 text-xs" onClick={checkAgain}>
                  Check again
                </Button>
              )}
            </li>
          </ol>
          {g.linkCodeExpiresAt && (
            <p className={`text-[11px] ${codeExpired ? 'text-red-600' : 'text-gray-500'}`}>
              {codeExpired
                ? `Code expired ${fmt(g.linkCodeExpiresAt)} — generate a new one.`
                : `Code expires ${fmt(g.linkCodeExpiresAt)}`}
            </p>
          )}
        </div>
        {renderTags(g)}
      </div>
    );
  };

  const linkedCount = groups?.filter(g => g.linked).length ?? 0;
  const hasGroups = !!groups && groups.length > 0;

  return (
    <div className={`rounded-md border p-4 space-y-3 ${disabled ? 'opacity-60' : ''}`} aria-disabled={disabled}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Users className="h-4 w-4 text-sky-600" />
            Team group
          </h3>
          <p className="text-[11px] text-gray-500">
            Post team activity (invoices, expenses, approvals…) to one or more Telegram groups,
            each with its own events. Employees' private chats are not affected.
          </p>
        </div>
        {linkedCount > 0 && (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
            {linkedCount === 1 ? 'Connected' : `${linkedCount} connected`}
          </Badge>
        )}
      </div>

      {disabled ? (
        <p className="text-sm text-gray-500">Set up the HR bot first.</p>
      ) : loading && !groups ? (
        <div className="py-3 text-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> Loading…
        </div>
      ) : hasGroups ? (
        <div className="space-y-2.5">
          {groups!.map(g => (g.linked ? renderLinked(g) : renderPending(g)))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No groups yet — add one, then pick what the bot posts there.</p>
      )}

      <Button size="sm" variant={hasGroups ? 'outline' : 'default'} onClick={addGroup} disabled={disabled || adding || (loading && !groups)}>
        {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
        Add group
      </Button>
    </div>
  );
}
