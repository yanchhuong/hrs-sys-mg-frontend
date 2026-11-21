import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '../../api/client';
import { clearTelegramPending, exchangeAndStore, keepTelegramPending, leaveTelegramNote } from '../../api/telegramAuth';
import { CompanyPicker } from './CompanyPicker';
import { TelegramHandoffFinish } from './TelegramHandoffFinish';

/**
 * v-telegram-login — /auth/telegram, where every Telegram round trip lands
 * (`#mode=login&code=…`, `#mode=login&error=…`, `#mode=connect&connected=1`,
 * `#mode=connect&error=…`, v-telegram-companies `#mode=select&selection=…`).
 * Trades a code for a session, leaves a note for the screen that loads
 * next, and reloads into the app — the web app has no URL per screen, and
 * the reload boots it signed in. A selection shows the company picker here.
 */
/** Once per page load: a second run would find the fragment already gone. */
let handled = false;
/** The selection read on the first run, for a re-mount of the same page load. */
let selectionOnce: string | null = null;
/** v-telegram-handoff — the ticket read on the first run, likewise. */
let ticketOnce: string | null = null;

export function TelegramCallbackPage() {
  const [selection, setSelection] = useState<string | null>(selectionOnce);
  const [ticket, setTicket] = useState<string | null>(ticketOnce);

  useEffect(() => {
    if (handled) return;
    handled = true;
    const p = new URLSearchParams(window.location.hash.slice(1));
    // The code is single-use and a minute long, but still: not in the
    // address bar, not in history.
    window.history.replaceState(null, '', '/auth/telegram');
    const mode = p.get('mode');
    const code = p.get('code');
    const error = p.get('error');
    const home = () => window.location.replace('/');

    void (async () => {
      if (mode === 'handoff' && p.get('ticket')) {
        // v-telegram-handoff — an app is waiting for this sign-in.
        ticketOnce = p.get('ticket');
        setTicket(ticketOnce);
        return;
      }
      if (mode === 'select' && p.get('selection')) {
        // v-telegram-companies — two or more companies: choose one.
        clearTelegramPending();
        selectionOnce = p.get('selection');
        setSelection(selectionOnce);
        return;
      }
      if (mode === 'connect') {
        leaveTelegramNote(p.get('connected') === '1'
          ? { kind: 'connected' }
          : { kind: 'connect_error', code: error || 'telegram_error' });
        return home();
      }
      if (code) {
        try {
          await exchangeAndStore(code);
          clearTelegramPending();
        } catch (e) {
          leaveTelegramNote({ kind: 'login_error', code: e instanceof ApiError ? e.message : 'telegram_error' });
        }
        return home();
      }
      // v-telegram-pending — not connected yet: the password sign-in that
      // follows offers to connect this Telegram.
      const pending = p.get('pending');
      if (pending) keepTelegramPending(pending);
      leaveTelegramNote({ kind: 'login_error', code: error || 'telegram_error' });
      return home();
    })();
  }, []);

  if (ticket) return <TelegramHandoffFinish ticket={ticket} />;
  if (selection) return <CompanyPicker selection={selection} />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Signing you in…
      </div>
    </div>
  );
}
