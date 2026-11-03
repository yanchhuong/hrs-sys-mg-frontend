/**
 * HrTelegramBotCard — register / update / enable / remove the tenant's
 * HR Telegram bot.
 *
 * Extracted from EmployeeSettingsDialog's HR Bot section (v-hr-bot-settings)
 * so Settings ▸ Telegram Bot can offer the same form. Both surfaces are
 * wanted: HR sets the bot up without leaving the Employees page, and
 * Settings is where you look for it once the bot serves system users
 * too. One component rather than two copies, so they cannot drift —
 * they already share the endpoints, and the copy around them is the
 * part that rots.
 *
 * `onBotChange` lets a parent react to the registration (the
 * connections list below it only makes sense once a bot exists).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Send, Trash2, Loader2, Save, Info } from 'lucide-react';
import * as hrBotApi from '../../api/hrTelegramBots';

interface Props {
  /** False parks the load — the dialog that hosts this only fetches
   *  while it is open. Omitted means "load now". */
  active?: boolean;
  /** The registered bot, or null, after every load and save. */
  onBotChange?: (bot: hrBotApi.HrTelegramBot | null) => void;
}

export function HrTelegramBotCard({ active = true, onBotChange }: Props) {
  const [bot, setBot] = useState<hrBotApi.HrTelegramBot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botDescription, setBotDescription] = useState('');
  const [botEnabled, setBotEnabled] = useState(false);

  // Re-fetch on every activation so a change made in the other
  // surface — or another tab — is reflected rather than stale.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    hrBotApi.getBot()
      .then(b => {
        if (cancelled) return;
        setBot(b);
        setBotUsername(b?.botUsername ?? '');
        setBotToken('');
        setBotDescription(b?.description ?? '');
        setBotEnabled(b?.enabled ?? false);
        onBotChange?.(b);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load HR bot'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onBotChange is a fresh closure every render; the load is keyed
    // on activation alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const save = async () => {
    const uname = botUsername.trim();
    const tok = botToken.trim();
    if (!uname) { toast.error('Bot username is required'); return; }
    if (!bot && !tok) { toast.error('Bot token is required when registering'); return; }
    setSaving(true);
    try {
      const saved = await hrBotApi.registerOrUpdate({
        botUsername: uname,
        botToken: tok,
        enabled: botEnabled,
        description: botDescription.trim() || undefined,
      });
      setBot(saved);
      setBotToken('');
      onBotChange?.(saved);
      toast.success(bot ? 'HR bot updated' : 'HR bot registered');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save HR bot');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await hrBotApi.deleteBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setBotDescription('');
      setBotEnabled(false);
      setConfirmDelete(false);
      onBotChange?.(null);
      toast.success('HR bot removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove HR bot');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
        <Send className="h-4 w-4 text-sky-600" />
        HR Telegram bot
        {/* Description lives in a hover tooltip — keeps the section
            header compact on the return visit while first-timers can
            still surface the @BotFather pointer one hover away. */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                className="text-gray-400 hover:text-gray-600"
                aria-label="About this bot"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              One bot for the whole company — employees receive payslips and run
              {' '}<code>/checkin</code> / <code>/checkout</code>, and system users get their
              notifications mirrored to the same chat. Create it in Telegram with
              {' '}<strong>@BotFather</strong>, paste the username and token here.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </h3>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> Loading…
        </div>
      ) : (
        <>
          {bot && (
            <div className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-2">
              <div className="text-sm">
                <div className="tabular-nums">@{bot.botUsername}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Token: <span className="tabular-nums">{bot.tokenMask}</span>
                </div>
              </div>
              <Badge variant="outline" className={bot.enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'}>
                {bot.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="hrbot-username">Bot username</Label>
            <Input
              id="hrbot-username"
              autoComplete="off"
              value={botUsername}
              onChange={e => setBotUsername(e.target.value.replace(/^@/, ''))}
              placeholder="MyCompanyHRBot"
            />
            <p className="text-[11px] text-gray-500">
              The @username from @BotFather, without the leading @.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hrbot-token">
              Bot token {bot && <span className="text-gray-400 text-[11px]">(paste again to update)</span>}
            </Label>
            <Input
              id="hrbot-token"
              autoComplete="new-password"
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hrbot-desc">
              Description <span className="text-gray-400 text-[11px]">(optional)</span>
            </Label>
            <Input
              id="hrbot-desc"
              value={botDescription}
              onChange={e => setBotDescription(e.target.value)}
              placeholder="HR comms bot — payslip + attendance"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium cursor-pointer">Enable HR bot</Label>
              <p className="text-[11px] text-gray-500">
                Off keeps the row saved but pauses link generation and message delivery.
              </p>
            </div>
            <Switch checked={botEnabled} onCheckedChange={setBotEnabled} disabled={saving} />
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            {bot ? (
              <Button
                variant="outline"
                size="sm"
                className="text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            ) : <span />}
            <Button onClick={save} disabled={saving || loading} size="sm">
              {saving
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Save className="h-4 w-4 mr-1.5" />}
              {bot ? 'Update bot' : 'Register bot'}
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove HR bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The token row is deleted; new connect links can't be generated until you register a bot
              again. Already-linked chats stay linked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
