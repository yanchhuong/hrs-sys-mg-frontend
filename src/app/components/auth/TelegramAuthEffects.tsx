import { useEffect, useRef, useState } from 'react';
import * as hrBotApi from '../../api/hrTelegramBots';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { ApiError } from '../../api/client';
import {
  clearTelegramPending, confirmTelegramPending, connectTicket, lookupTelegramPending, myTelegram, onBackForward,
  peekTelegramPending, promptSnoozed, snoozePrompt, takePasswordSignIn, takeTelegramNote,
  telegramConnectUrl, telegramErrorMessage, telegramOptions, type PendingTelegram,
} from '../../api/telegramAuth';
import { TelegramIcon, TELEGRAM_BLUE } from './TelegramIcon';

/**
 * v-telegram-login — what a signed-in app does about Telegram on load:
 *  - the result of a "Connect Telegram" round trip (a toast);
 *  - once after a PASSWORD sign-in, when this account has no Telegram yet:
 *      · v-telegram-pending (spec phase 2b, T-21) — a Telegram this tab
 *        just tried and was turned away with: "Connect Telegram @username?"
 *        (shown even while the general prompt is snoozed);
 *      · otherwise spec §12.3 "Sign in faster next time" ("Not now" = quiet
 *        for 7 days).
 */
export function TelegramAuthEffects() {
  const [open, setOpen] = useState(false);
  /** BR-13 — connect through the company's HR bot when it has one. */
  const viaBot = useRef(false);
  const [pending, setPending] = useState<(PendingTelegram & { code: string }) | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const connected = takeTelegramNote('connected');
    if (connected) toast.success('Telegram connected');
    const failed = takeTelegramNote('connect_error');
    if (failed) toast.error(telegramErrorMessage(failed.code));

    const off = onBackForward(() => setBusy(false));
    if (!takePasswordSignIn()) return off;
    let live = true;
    void (async () => {
      const o = await telegramOptions();
      if (!o.enabled) return;
      let linked: boolean;
      try {
        const s = await myTelegram();
        // BR-13 — already on the HR bot = Telegram sign-in works already.
        linked = s.linked || !!s.notifications;
        viaBot.current = !!s.botAvailable;
      } catch { return; }
      if (!live) return;
      const code = peekTelegramPending();
      if (code) {
        if (linked) {
          clearTelegramPending();   // this account already has one
        } else {
          const p = await lookupTelegramPending(code);
          if (!live) return;
          if (p) { setPending({ ...p, code }); return; }
          clearTelegramPending(false);   // expired or gone
        }
      }
      if (!linked && !promptSnoozed()) setOpen(true);
    })();
    return () => { live = false; off(); };
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      // BR-13 — one connection: through the HR bot when the company has one.
      if (viaBot.current) {
        const res = await hrBotApi.generateMyLink();
        window.open(res.url, '_blank', 'noopener');
        setOpen(false);
        setBusy(false);
        toast.info('Telegram opened — press Start there.');
        return;
      }
      window.location.assign(telegramConnectUrl(await connectTicket()));
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error && e.message ? e.message : telegramErrorMessage('telegram_error'));
    }
  };

  const notNow = () => { snoozePrompt(); setOpen(false); };

  /* ---------------- the pending Telegram ---------------- */

  const connectPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await confirmTelegramPending(pending.code);
      clearTelegramPending(false);
      toast.success('Telegram connected');
      setPending(null);
    } catch (e) {
      clearTelegramPending(false);
      setPending(null);
      const code = e instanceof ApiError && e.status === 409 ? e.message : e instanceof ApiError && e.status === 404 ? 'selection_expired' : '';
      toast.error(telegramErrorMessage(code || 'telegram_error'));
    } finally {
      setBusy(false);
    }
  };

  const pendingNotNow = () => { clearTelegramPending(); snoozePrompt(); setPending(null); };

  const who = pending?.username ? `@${pending.username}` : pending?.name || 'this Telegram';

  return (
    <>
      <Dialog open={!!pending} onOpenChange={o => { if (!o && !busy) pendingNotNow(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            {/* The Telegram photo once it has loaded (so a mismatch is
                obvious); the Telegram mark until then, or if it never does. */}
            {pending?.photoUrl && !photoFailed && (
              <img src={pending.photoUrl} alt="" referrerPolicy="no-referrer"
                onLoad={e => (e.currentTarget.naturalWidth > 8 ? setPhotoLoaded(true) : setPhotoFailed(true))}
                onError={() => setPhotoFailed(true)}
                className={photoLoaded ? 'mx-auto mb-1 h-12 w-12 rounded-full object-cover' : 'hidden'} />
            )}
            {!photoLoaded && (
              <div className="mx-auto mb-1 h-11 w-11 rounded-full flex items-center justify-center text-white" style={{ background: TELEGRAM_BLUE }}>
                <TelegramIcon className="h-5 w-5" />
              </div>
            )}
            <DialogTitle className="text-center">Connect Telegram {who}?</DialogTitle>
            <DialogDescription className="text-center">
              {pending?.name && pending.username ? `${pending.name} · ` : ''}You tried it on this device a moment ago.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={pendingNotNow} disabled={busy}>Not now</Button>
            <Button onClick={() => void connectPending()} disabled={busy} className="text-white hover:opacity-90" style={{ background: TELEGRAM_BLUE }}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <TelegramIcon className="mr-1.5 h-4 w-4" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={o => { if (!o) notNow(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-1 h-11 w-11 rounded-full flex items-center justify-center text-white" style={{ background: TELEGRAM_BLUE }}>
              <TelegramIcon className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center">Sign in faster next time</DialogTitle>
            <DialogDescription className="text-center">
              Connect your Telegram account and skip the password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={notNow} disabled={busy}>Not now</Button>
            <Button onClick={connect} disabled={busy} className="text-white hover:opacity-90" style={{ background: TELEGRAM_BLUE }}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <TelegramIcon className="mr-1.5 h-4 w-4" />}
              Connect Telegram
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
