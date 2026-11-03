/**
 * MyTelegramCard — link your own Telegram to the company's HR bot, from
 * Your Profile (v-hr-bot-users). The bot is shared with every signed-in
 * user, not only employees: bell notifications reach this chat, and an
 * employee also gets Check-in / This Month / leave there.
 *
 * Hidden when the company has no enabled HR bot. "Connect" opens the
 * bot's /start link in Telegram; pressing Start there links the chat.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Send, RefreshCw, Link2Off, CheckCircle2 } from 'lucide-react';
import * as hrBotApi from '../../api/hrTelegramBots';
import { useConfirm } from '../../context/ConfirmContext';

export function MyTelegramCard() {
  const confirm = useConfirm();
  const [available, setAvailable] = useState(false);
  const [link, setLink] = useState<hrBotApi.HrTelegramEmployee | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const a = await hrBotApi.myBotAvailable();
      setAvailable(a);
      setLink(a ? await hrBotApi.getMyLink() : null);
    } catch {
      setAvailable(false);
    }
  };
  useEffect(() => { void load(); }, []);

  if (!available) return null;

  const connect = async () => {
    setBusy(true);
    try {
      const res = await hrBotApi.generateMyLink();
      window.open(res.url, '_blank', 'noopener');
      toast.info('Telegram opened — press Start there, then come back and tap Check.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!(await confirm({
      title: 'Disconnect Telegram?',
      message: 'This chat stops receiving your HR notifications. You can connect again any time.',
      confirmLabel: 'Disconnect',
      variant: 'destructive',
    }))) return;
    setBusy(true);
    try {
      await hrBotApi.unlinkMe();
      setLink(null);
      toast.success('Telegram disconnected');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not disconnect');
    } finally {
      setBusy(false);
    }
  };

  const who = link
    ? (link.displayName?.trim() || (link.telegramUsername ? `@${link.telegramUsername}` : `Chat #${link.chatId}`))
    : null;

  return (
    <div className="rounded-md border p-3 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <Send className={`h-5 w-5 mt-0.5 ${link ? 'text-sky-600' : 'text-gray-400'}`} />
        <div className="min-w-0">
          <div className="text-sm font-medium">Telegram (HR bot)</div>
          <p className="text-xs text-gray-500 mt-0.5">
            {link
              ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Connected as {who}</span>
              : 'Get your approvals, leave and other notifications in Telegram.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {link ? (
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={disconnect} disabled={busy}>
            <Link2Off className="h-3.5 w-3.5 mr-1" /> Disconnect
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={connect} disabled={busy}>
              <Send className="h-3.5 w-3.5 mr-1" /> Connect
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => void load()} disabled={busy}
              title="Check whether Telegram is connected" aria-label="Check whether Telegram is connected">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
