import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  claimHandoff, clearHandoff, confirmHandoff, followTelegramFragment, handoffSecret, telegramErrorMessage,
} from '../../api/telegramAuth';
import { TelegramIcon, TELEGRAM_BLUE } from './TelegramIcon';

type State = 'checking' | 'ask' | 'done' | 'expired';

/**
 * v-telegram-handoff — /auth/telegram#mode=handoff&ticket=…: the window
 * Telegram's page finished in, while the app that started waits.
 *
 *  - Same browser as the app (the pop-up): hands the sign-in over without a
 *    question and closes; with no app left waiting, finishes here instead.
 *  - Anywhere else: asks first — so a sign-in link someone forwarded can't
 *    hand them your session — then says to go back to the app.
 */
export function TelegramHandoffFinish({ ticket }: { ticket: string }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let live = true;
    void (async () => {
      const secret = handoffSecret();
      try {
        if (!secret || !(await confirmHandoff(ticket, secret))) { if (live) setState('ask'); return; }
        // The app's pop-up: the app collects it.
        if (window.opener && !window.opener.closed) { setState('done'); window.close(); return; }
        // No app waiting any more (its tab was closed): finish here.
        const fragment = await claimHandoff(secret);
        if (fragment) { clearHandoff(); followTelegramFragment(fragment); return; }
        if (live) setState('expired');
      } catch {
        if (live) setState('expired');
      }
    })();
    return () => { live = false; };
  }, [ticket]);

  const finish = async () => {
    try {
      await confirmHandoff(ticket, null, true);
      setState('done');
      window.close();
    } catch {
      setState('expired');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg space-y-4 text-center">
        {state === 'checking' && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Finishing sign-in…
          </div>
        )}
        {state === 'ask' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: TELEGRAM_BLUE }}>
              <TelegramIcon className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-semibold text-gray-900">Finish signing in to the app?</h1>
            <p className="text-sm text-gray-600">
              Continue only if you just pressed “Continue with Telegram” in the Smart HRMS app yourself.
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={finish} className="w-full text-white hover:opacity-90" style={{ background: TELEGRAM_BLUE }}>
                Continue
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => window.location.replace('/')}>
                Not me
              </Button>
            </div>
          </>
        )}
        {state === 'done' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-lg font-semibold text-gray-900">Done</h1>
            <p className="text-sm text-gray-600">Go back to the app — you're signed in there. You can close this window.</p>
          </>
        )}
        {state === 'expired' && (
          <>
            <h1 className="text-lg font-semibold text-gray-900">Sign-in not finished</h1>
            <p className="text-sm text-gray-600">{telegramErrorMessage('selection_expired')}</p>
            <Button type="button" variant="outline" className="w-full" onClick={() => window.location.replace('/')}>
              Go to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
