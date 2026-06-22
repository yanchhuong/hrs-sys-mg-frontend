import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, Trash2, Info } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import * as telegramApi from '../../api/telegram';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Settings popup for the tenant's customer-facing Telegram bot.
 * Previously this lived as a Settings → Telegram tab; surfaced here
 * because the bot is functionally bound to customer linking and
 * "where is this configured?" is a less obvious question when it's
 * on a deep settings page.
 *
 * <p>Token field is write-only — the API returns last-4 only, so
 * pasting a fresh secret is the only way to rotate; the form stays
 * empty after load to make that requirement obvious.</p>
 */
export function CustomerTelegramBotSettingsDialog({ open, onOpenChange }: Props) {
  const [bot, setBot] = useState<telegramApi.TelegramBot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    telegramApi.getBot()
      .then(b => {
        if (cancelled) return;
        setBot(b);
        setBotUsername(b?.botUsername ?? '');
        setBotToken('');                        // never pre-fill the secret
        setDescription(b?.description ?? '');
        setEnabled(b?.enabled ?? false);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load Telegram bot'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const handleSave = async () => {
    const uname = botUsername.trim();
    const tok = botToken.trim();
    if (!uname) { toast.error('Bot username is required'); return; }
    if (!bot && !tok) { toast.error('Bot token is required when registering'); return; }
    setSaving(true);
    try {
      const saved = await telegramApi.putBot({
        botUsername: uname,
        botToken: tok,
        enabled,
        description: description.trim() || undefined,
      });
      setBot(saved);
      setBotToken('');
      toast.success(bot ? 'Telegram bot updated' : 'Telegram bot registered');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save Telegram bot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await telegramApi.deleteBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setDescription('');
      setEnabled(false);
      setConfirmDelete(false);
      toast.success('Telegram bot removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove Telegram bot');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-sky-600" />
              Customer Telegram Bot
              {/* The verbose "what is this?" copy is hidden behind an
                  Info hover so the dialog stays compact for the
                  return visit (operator already knows the gist), while
                  first-timers still get the BotFather pointer one
                  hover away. */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="About this bot"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    Register the bot customers use to receive invoices,
                    quotations, and reminders. Create the bot in Telegram
                    with <strong>@BotFather</strong>, paste the username and
                    token here.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
            {/* Keep the same copy in DialogDescription as sr-only so
                screen readers still announce the bot's purpose — the
                tooltip is mouse-only and Radix' Dialog warns when
                DialogDescription is missing. */}
            <DialogDescription className="sr-only">
              Register the bot customers use to receive invoices, quotations, and
              reminders. Create the bot in Telegram with @BotFather, paste the
              username and token here.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-6 text-center text-sm text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              {bot && (
                <div className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-2">
                  <div className="text-sm">
                    <div className="font-mono">@{bot.botUsername}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Token: <span className="font-mono">••••••••{bot.tokenTail}</span>
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
                <Label htmlFor="custbot-username">Bot username</Label>
                <Input
                  id="custbot-username"
                  value={botUsername}
                  onChange={e => setBotUsername(e.target.value.replace(/^@/, ''))}
                  placeholder="MyCompanyBot"
                />
                <p className="text-[11px] text-gray-500">
                  The @username from @BotFather, without the leading @.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custbot-token">Bot token {bot && <span className="text-gray-400 text-[11px]">(paste again to update)</span>}</Label>
                <Input
                  id="custbot-token"
                  type="password"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custbot-desc">Description <span className="text-gray-400 text-[11px]">(optional)</span></Label>
                <Input
                  id="custbot-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Customer comms bot — invoices, quotations"
                />
              </div>

              <div className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <Label className="text-sm">Use our own bot</Label>
                  <p className="text-[11px] text-gray-500">
                    Off falls back to the platform-shared bot (if Super Admin enabled it).
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {bot && (
              <Button
                variant="outline"
                className="text-red-700 border-red-200 hover:bg-red-50 mr-auto"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : bot ? 'Update' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Telegram bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The token row is deleted; new connect links can't be generated until you
              register a bot again. Already-linked customers stay linked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
