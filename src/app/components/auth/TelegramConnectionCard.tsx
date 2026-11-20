import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2Off, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useConfirm } from '../../context/ConfirmContext';
import * as hrBotApi from '../../api/hrTelegramBots';
import {
  connectTicket, disconnectTelegram, myTelegram, onBackForward, telegramConnectUrl, telegramErrorMessage, telegramSiteOk,
  type TelegramStatus,
} from '../../api/telegramAuth';
import { TelegramIcon, TELEGRAM_BLUE } from './TelegramIcon';

/**
 * v-telegram-one-connection — spec v1.3 §12.7, Account › Telegram: ONE row
 * for the one Telegram connection that carries both HR notifications (the
 * bot) and sign-in (BR-13). Never two rows, never "connect the same
 * Telegram twice".
 *
 *  - nothing connected      → Connect Telegram (the bot's deep link; Telegram
 *                             sign-in then works on its own — BR-13)
 *  - notifications, sign-in → Disconnect (both go)
 *  - notifications only     → "Sign-in: Enable" (Telegram round trip; must be
 *                             the bot's account — BR-14)
 *  - sign-in only           → "Notifications: Open bot" (deep link)
 */
export function TelegramConnectionCard() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await myTelegram()); } catch { /* row stays hidden */ }
  }, []);

  useEffect(() => {
    void load();
    // Back from Telegram (the bot opens in another tab): re-check.
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    const off = onBackForward(() => setBusy(false));
    return () => { window.removeEventListener('focus', onFocus); off(); };
  }, [load]);

  if (!status) return null;
  const notifications = !!status.notifications;
  const signIn = status.linked;
  const botAvailable = !!status.botAvailable;
  // Sign-in is a round trip back to the real site — offered there only.
  const signInAvailable = !!status.signInAvailable && telegramSiteOk();
  if (!notifications && !signIn && !botAvailable && !signInAvailable) return null;

  /** The bot's /start link — the one connect flow when the company has an HR bot. */
  const openBot = async () => {
    setBusy(true);
    try {
      const res = await hrBotApi.generateMyLink();
      window.open(res.url, '_blank', 'noopener');
      toast.info('Telegram opened — press Start there, then come back.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open Telegram');
    } finally {
      setBusy(false);
    }
  };

  /** Telegram sign-in round trip (it comes back here). */
  const enableSignIn = async () => {
    setBusy(true);
    try {
      window.location.assign(telegramConnectUrl(await connectTicket()));
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error && e.message ? e.message : telegramErrorMessage('telegram_error'));
    }
  };

  const connect = () => (botAvailable ? openBot() : enableSignIn());

  const disconnect = async () => {
    const message = notifications && signIn
      ? "You'll stop receiving HR notifications on Telegram and can't sign in with Telegram."
      : notifications ? "You'll stop receiving HR notifications on Telegram."
      : "You can't sign in with Telegram until you connect it again.";
    if (!(await confirm({ title: 'Disconnect Telegram?', message, confirmLabel: 'Disconnect', variant: 'destructive' }))) return;
    setBusy(true);
    try {
      await disconnectTelegram();
      toast.success('Telegram disconnected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not disconnect Telegram');
    } finally {
      setBusy(false);
    }
  };

  const connected = notifications || signIn;
  const name = status.displayName?.trim() || (status.username ? `@${status.username}` : 'Telegram');
  const linkClass = 'font-medium text-blue-600 hover:underline disabled:opacity-60';

  return (
    <div className="rounded-md border p-3 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <Send className={`h-5 w-5 mt-0.5 shrink-0 ${connected ? 'text-sky-600' : 'text-gray-400'}`} />
        <div className="min-w-0">
          <div className="text-sm font-medium">Telegram</div>
          {!connected ? (
            <p className="text-xs text-gray-500 mt-0.5">
              {botAvailable ? 'Get HR notifications and sign in with one tap.' : 'Sign in with one tap using Telegram.'}
            </p>
          ) : (
            <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected as {name}
              </span>
              {notifications && <span>· Notifications ✓</span>}
              {signIn && <span>· Sign-in ✓</span>}
              {notifications && !signIn && signInAvailable && (
                <span>· Sign-in: <button type="button" className={linkClass} onClick={() => void enableSignIn()} disabled={busy}>Enable</button></span>
              )}
              {signIn && !notifications && botAvailable && (
                <span>· Notifications: <button type="button" className={linkClass} onClick={() => void openBot()} disabled={busy}>Open bot</button></span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {connected ? (
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void disconnect()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2Off className="h-3.5 w-3.5 mr-1" />} Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void connect()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <span className="mr-1 inline-flex" style={{ color: TELEGRAM_BLUE }}><TelegramIcon className="h-3.5 w-3.5" /></span>}
            Connect Telegram
          </Button>
        )}
      </div>
    </div>
  );
}
