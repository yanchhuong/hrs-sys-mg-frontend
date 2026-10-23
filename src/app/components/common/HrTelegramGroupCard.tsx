import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Users, Loader2, Copy, Check, Link2, Unlink } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import * as groupApi from '../../api/hrTelegramGroup';
import type { HrTelegramBot } from '../../api/hrTelegramBots';

type EventKey = 'postInvoices' | 'postExpenses' | 'postApprovals' | 'postCashAdvance' | 'postActivity';

const EVENTS: { key: EventKey; label: string }[] = [
  { key: 'postInvoices',    label: 'Invoices' },
  { key: 'postExpenses',    label: 'Expenses & Bills' },
  { key: 'postApprovals',   label: 'Approvals' },
  { key: 'postCashAdvance', label: 'Cash advance & Voucher' },
  { key: 'postActivity',    label: 'Activities' },
];

const POLL_MS = 5000;

interface Props {
  /** The tenant's HR bot (null = not registered). The card is disabled
   *  until a bot exists — the group link is redeemed by that bot. */
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

/**
 * "Team group" card — connects the company's shared Telegram group
 * where the HR bot posts team activity. Flow: Connect group → mint a
 * `/link CODE` → admin sends it in the group → card polls GET every 5 s
 * until the server reports `linked`. Event switches save on toggle.
 */
export function HrTelegramGroupCard({ bot, active }: Props) {
  const confirm = useConfirm();
  const disabled = !bot;

  const [group, setGroup] = useState<groupApi.HrTelegramGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const groupRef = useRef(group);
  groupRef.current = group;

  /** Merge a server response. A poll that comes back still-unlinked
   *  without a code keeps the locally shown code so the steps don't
   *  vanish mid-flow. */
  const applyServer = useCallback((next: groupApi.HrTelegramGroup, keepCode = false) => {
    setGroup(prev => {
      if (keepCode && prev && !next.linked && !next.linkCode && prev.linkCode) {
        return { ...next, linkCode: prev.linkCode, linkCodeExpiresAt: prev.linkCodeExpiresAt };
      }
      return next;
    });
  }, []);

  // Initial load (re-run each time the host opens).
  useEffect(() => {
    if (!active || disabled) return;
    let cancelled = false;
    setLoading(true);
    groupApi.getGroup()
      .then(g => { if (!cancelled) setGroup(g); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load team group'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, disabled]);

  const linkCode = group && !group.linked ? group.linkCode : null;
  const expiresAt = linkCode ? group?.linkCodeExpiresAt ?? null : null;
  const expiryMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const [, forceTick] = useState(0);
  const codeExpired = !isNaN(expiryMs) && Date.now() >= expiryMs;

  // Re-render at the expiry instant so the card flips to "expired".
  useEffect(() => {
    if (isNaN(expiryMs) || Date.now() >= expiryMs) return;
    const t = window.setTimeout(() => forceTick(n => n + 1), Math.min(expiryMs - Date.now() + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [expiryMs]);

  // Poll while a code is showing, stop once linked or expired.
  useEffect(() => {
    if (!active || disabled || !linkCode) return;
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const expired = () => !isNaN(expiryMs) && Date.now() >= expiryMs;
    if (expired()) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (expired()) { window.clearInterval(id); return; }
      groupApi.getGroup()
        .then(g => {
          if (cancelled) return;
          applyServer(g, true);
          if (g.linked) {
            window.clearInterval(id);
            toast.success(g.title ? `Connected to «${g.title}»` : 'Team group connected');
          }
        })
        .catch(() => { /* transient — next tick retries */ });
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [active, disabled, linkCode, expiresAt, applyServer]);

  const connect = async () => {
    setBusy(true);
    try {
      applyServer(await groupApi.createLinkCode());
      setCopied(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create link code');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!group) return;
    const ok = await confirm({
      title: 'Disconnect team group?',
      message: `The HR bot will stop posting to «${group.title ?? 'this group'}». Your event switches are kept.`,
      confirmLabel: 'Disconnect',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      applyServer(await groupApi.disconnectGroup());
      toast.success('Team group disconnected');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to disconnect group');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (key: EventKey, value: boolean) => {
    if (!groupRef.current) return;
    setGroup(prev => (prev ? { ...prev, [key]: value } : prev));
    try {
      await groupApi.updateEvents({ [key]: value });
    } catch (e) {
      setGroup(prev => (prev ? { ...prev, [key]: !value } : prev));
      toast.error(e instanceof Error ? e.message : 'Failed to save setting');
    }
  };

  const copyCommand = async () => {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${linkCode}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed — select the command and copy it manually');
    }
  };

  return (
    <div className={`rounded-md border p-4 space-y-3 ${disabled ? 'opacity-60' : ''}`} aria-disabled={disabled}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Users className="h-4 w-4 text-sky-600" />
            Team group
          </h3>
          <p className="text-[11px] text-gray-500">
            Post team activity (invoices, expenses, approvals…) to a Telegram group.
            Employees' private chats are not affected.
          </p>
        </div>
        {group?.linked && (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
            Connected
          </Badge>
        )}
      </div>

      {disabled ? (
        <p className="text-sm text-gray-500">Set up the HR bot first.</p>
      ) : loading && !group ? (
        <div className="py-3 text-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> Loading…
        </div>
      ) : (
        <>
          {group?.linked ? (
            <div className="flex items-center justify-between gap-3 bg-slate-50 border rounded-md px-3 py-2">
              <div className="text-sm min-w-0">
                Connected to <span className="font-medium">«{group.title ?? 'Telegram group'}»</span>
                {group.linkedAt && <> since {fmtDate(group.linkedAt)}</>}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-red-700 border-red-200 hover:bg-red-50 shrink-0"
                onClick={disconnect}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Unlink className="h-4 w-4 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          ) : linkCode ? (
            <div className="bg-slate-50 border rounded-md px-3 py-3 space-y-2 text-sm">
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  Add the HR bot{bot?.botUsername && <> (<span className="font-medium">@{bot.botUsername}</span>)</>} to your Telegram group.
                </li>
                <li>
                  In the group, send:
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-white border px-2 py-1 font-mono text-sm select-all">/link {linkCode}</code>
                    <Button type="button" variant="outline" size="sm" className="h-7" onClick={copyCommand}>
                      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </li>
                <li>
                  Wait a moment — this card will show the group name.
                  {!codeExpired && <Loader2 className="h-3.5 w-3.5 ml-1.5 animate-spin text-gray-400 inline" />}
                </li>
              </ol>
              <div className="flex items-center justify-between gap-2 pt-1">
                {expiresAt ? (
                  <p className={`text-[11px] ${codeExpired ? 'text-red-600' : 'text-gray-500'}`}>
                    {codeExpired ? `Code expired ${fmt(expiresAt)} — generate a new one.` : `Code expires ${fmt(expiresAt)}`}
                  </p>
                ) : <span />}
                <Button variant={codeExpired ? 'outline' : 'ghost'} size="sm" className="h-7" onClick={connect} disabled={busy}>
                  New code
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={connect} disabled={busy || !group}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}
              Connect group
            </Button>
          )}
        </>
      )}

      <div className="divide-y rounded-md border">
        {EVENTS.map(ev => (
          <label
            key={ev.key}
            className={`flex items-center justify-between gap-3 px-3 py-2 ${disabled || !group ? '' : 'cursor-pointer'}`}
          >
            <Label className="text-sm font-normal cursor-[inherit]">{ev.label}</Label>
            <Switch
              checked={group?.[ev.key] ?? false}
              onCheckedChange={v => toggle(ev.key, v)}
              disabled={disabled || !group}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
