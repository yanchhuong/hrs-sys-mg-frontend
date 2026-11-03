/**
 * HrTelegramLinkCell — moved out of Employees.tsx so User Management can
 * show the same Telegram column for users (v-hr-bot-users).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Send, Copy, Check, Link2Off, CheckCircle2, RefreshCw } from 'lucide-react';
import * as hrBotApi from '../../api/hrTelegramBots';

/* -------------------------------------------------------------------------- */
/**
 * Renders the HR Telegram linkage state for one employee or user row
 * (v-hr-bot-users — the HR bot is shared with system users too).
 *
 *   • Not linked → "Share link" button. Click mints a 24-hour
 *     deep-link URL (POST /hr-telegram/links) and pops a dialog
 *     with a Copy button so HR can paste it to the employee.
 *   • Linked     → green-check identity ("Display Name" + @handle)
 *     + a quiet "Unlink" action behind an AlertDialog confirmation.
 *
 * Mirrors the Customer-side TelegramCell so HR has a single mental
 * model whether they're connecting an employee or a customer.
 */
export function HrTelegramLinkCell({
  name, noun, linked, canShare, canUnlink, onChanged, generate, unlink: unlinkLink,
}: {
  /** Shown in the dialogs — the employee's or user's name. */
  name: string;
  /** What is being linked — 'employee' (Employees) or 'user' (User Management). */
  noun: 'employee' | 'user';
  linked: hrBotApi.HrTelegramEmployee | null;
  canShare: boolean;
  canUnlink: boolean;
  onChanged: () => void;
  /** Mints the 24-hour /start link for this person. */
  generate: () => Promise<hrBotApi.HrTelegramLinkResponse>;
  /** Drops this person's chat binding. */
  unlink: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Unlink is destructive — the chat binding goes away, so re-linking
  // means generating a fresh deep-link and the employee clicking
  // /start again. Worth a 1-click "are you sure?" interstitial.
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const res = await generate();
      setLinkUrl(res.url);
      setExpiresAt(res.expiresAt);
      setCopied(false);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate connect link');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await unlinkLink();
      toast.success(`${name} unlinked from Telegram`);
      setConfirmUnlinkOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  if (linked) {
    const display =
      linked.displayName?.trim()
      || (linked.telegramUsername ? `@${linked.telegramUsername}` : `Chat #${linked.chatId}`);
    const handle = linked.telegramUsername ? `@${linked.telegramUsername}` : null;
    return (
      <div className="flex items-center gap-1.5">
        {/* v-telegram-linked-tooltip — compact "Connected" pill;
            hover / tap-focus reveals the Telegram display name +
            @handle + chat id in a tooltip so the row width stays
            stable regardless of the employee's Telegram name. */}
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 cursor-help"
                aria-label={`Connected as ${display}${handle ? ' ' + handle : ''}`}
              >
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              <div className="font-medium">{display}</div>
              {handle && <div className="tabular-nums text-gray-300">{handle}</div>}
              <div className="tabular-nums text-gray-300">Chat #{linked.chatId}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {canUnlink && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setConfirmUnlinkOpen(true)}
            disabled={busy}
            title="Unlink this Telegram chat"
            aria-label="Unlink this Telegram chat"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        )}
        <AlertDialog open={confirmUnlinkOpen} onOpenChange={setConfirmUnlinkOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Unlink {name} from Telegram?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {linked?.telegramUsername
                  ? <>The chat <span className="tabular-nums">@{linked.telegramUsername}</span> will no longer receive HR messages for this {noun}.</>
                  : <>This chat will no longer receive HR messages for this {noun}.</>}
                {' '}You can re-share a fresh link later — they will need to click <strong>Start</strong> on Telegram again to reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={unlink}
                className="bg-red-600 hover:bg-red-700"
                disabled={busy}
              >
                Unlink
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          {canShare ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={share}
              disabled={busy}
            >
              <Send className="h-3 w-3 mr-1" />
              {busy ? 'Generating…' : 'Share'}
            </Button>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
          {/* Recheck — useful right after sharing a link so HR can
              poll for the employee's /start click without refreshing
              the whole roster. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
            onClick={() => onChanged()}
            disabled={busy}
            title="Check if they have connected"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) onChanged();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Telegram link</DialogTitle>
            <DialogDescription>
              Send this link to <span className="font-medium">{name}</span>.
              After they click <strong>Start</strong> on Telegram, their chat
              will be bound to their {noun === 'user' ? 'user account' : 'employee record'}.
            </DialogDescription>
          </DialogHeader>
          {linkUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input value={linkUrl} readOnly className="tabular-nums text-xs" />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied
                    ? <><Check className="h-3.5 w-3.5 mr-1" /> Copied</>
                    : <><Copy className="h-3.5 w-3.5 mr-1" /> Copy</>}
                </Button>
              </div>
              {expiresAt && (
                <div className="text-[11px] text-gray-500">
                  Expires {new Date(expiresAt).toLocaleString()}. Generate a fresh one if it lapses.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { onChanged(); toast.success('Checked'); }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Check connection
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
