import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Users, Loader2, Copy, Check, Plus, Unlink, X } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import * as groupApi from '../../api/hrTelegramGroup';
import type { HrTelegramBot } from '../../api/hrTelegramBots';

type Group = groupApi.HrTelegramGroup;
type EventKey = 'postInvoices' | 'postExpenses' | 'postApprovals' | 'postCashAdvance' | 'postActivity'
  | 'postAttendance' | 'postOvertime' | 'postLeave' | 'postPayroll' | 'postEmployee';

const EVENTS: { key: EventKey; label: string }[] = [
  { key: 'postInvoices',    label: 'Invoices' },
  { key: 'postExpenses',    label: 'Expenses & Bills' },
  { key: 'postApprovals',   label: 'Approvals' },
  { key: 'postCashAdvance', label: 'Cash advance & Voucher' },
  { key: 'postActivity',    label: 'Activities' },
  { key: 'postAttendance',  label: 'Attendance' },
  { key: 'postOvertime',    label: 'Overtime' },
  { key: 'postLeave',       label: 'Leave' },
  { key: 'postPayroll',     label: 'Payroll' },
  { key: 'postEmployee',    label: 'Employees' },
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
 * bot posts team activity, each with its own event switches. Flow:
 * Add group → server mints a pending row with a `/link CODE` → admin
 * sends it in the group → card polls GET every 5 s (only while a live
 * code exists, tab visible, for at most 5 min) until the row is linked.
 * Event switches save on toggle (pending rows can be preset).
 */
export function HrTelegramGroupCard({ bot, active }: Props) {
  const confirm = useConfirm();
  const disabled = !bot;

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

  const renderSwitches = (g: Group | null) => (
    <div className="divide-y rounded-md border bg-white">
      {EVENTS.map(ev => (
        <label
          key={ev.key}
          className={`flex items-center justify-between gap-3 px-3 py-2 ${disabled || !g ? '' : 'cursor-pointer'}`}
        >
          <Label className="text-sm font-normal cursor-[inherit]">{ev.label}</Label>
          <Switch
            checked={g?.[ev.key] ?? false}
            onCheckedChange={v => { if (g) toggle(g.id, ev.key, v); }}
            disabled={disabled || !g}
          />
        </label>
      ))}
    </div>
  );

  const renderLinked = (g: Group) => {
    const isBusy = !!busy[g.id];
    return (
      <div key={g.id} className="space-y-2">
        <div className="flex items-center justify-between gap-3 bg-slate-50 border rounded-md px-3 py-2">
          <div className="text-sm min-w-0">
            ✅ Connected to <span className="font-medium">«{g.title ?? 'Telegram group'}»</span>
            {g.linkedAt && <> since {fmtDate(g.linkedAt)}</>}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-red-700 border-red-200 hover:bg-red-50 shrink-0"
            onClick={() => disconnect(g)}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Unlink className="h-4 w-4 mr-1.5" />}
            Disconnect
          </Button>
        </div>
        {renderSwitches(g)}
      </div>
    );
  };

  const renderPending = (g: Group) => {
    const isBusy = !!busy[g.id];
    const exp = expiryOf(g);
    const codeExpired = !isNaN(exp) && now >= exp;
    const copied = copiedId === g.id;
    return (
      <div key={g.id} className="space-y-2">
        <div className="bg-slate-50 border rounded-md px-3 py-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600">New group — waiting for /link</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-gray-600"
              onClick={() => cancelPending(g)}
              disabled={isBusy}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
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
          <div className="flex items-center justify-between gap-2 pt-1">
            {g.linkCodeExpiresAt ? (
              <p className={`text-[11px] ${codeExpired ? 'text-red-600' : 'text-gray-500'}`}>
                {codeExpired
                  ? `Code expired ${fmt(g.linkCodeExpiresAt)} — generate a new one.`
                  : `Code expires ${fmt(g.linkCodeExpiresAt)}`}
              </p>
            ) : <span />}
            <Button
              variant={codeExpired ? 'outline' : 'ghost'}
              size="sm"
              className="h-7"
              onClick={() => newCode(g)}
              disabled={isBusy}
            >
              {isBusy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              New code
            </Button>
          </div>
        </div>
        {renderSwitches(g)}
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
        <div className="space-y-4">
          {groups!.map(g => (g.linked ? renderLinked(g) : renderPending(g)))}
        </div>
      ) : null}

      {/* Preview of what the feature posts while no group exists yet. */}
      {!hasGroups && renderSwitches(null)}

      <Button size="sm" variant={hasGroups ? 'outline' : 'default'} onClick={addGroup} disabled={disabled || adding || (loading && !groups)}>
        {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
        Add group
      </Button>
    </div>
  );
}
