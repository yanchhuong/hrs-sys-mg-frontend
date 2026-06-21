import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, Trash2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import * as hrBotApi from '../../api/hrTelegramBots';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Settings dialog for the tenant's HR Telegram bot. Shows the
 * current bot (if any) and lets admin register / update / toggle /
 * delete. Sibling of the customer-bot dialog but on its own
 * permission gate (hr_telegram).
 */
export function HrTelegramBotSettingsDialog({ open, onOpenChange }: Props) {
  const [bot, setBot] = useState<hrBotApi.HrTelegramBot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state — kept separate from `bot` so the user can edit
  // without optimistic mutation, and the Cancel button is a real cancel.
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    hrBotApi.getBot()
      .then(b => {
        if (cancelled) return;
        setBot(b);
        setBotUsername(b?.botUsername ?? '');
        setBotToken('');                        // never pre-fill the secret
        setDescription(b?.description ?? '');
        setEnabled(b?.enabled ?? false);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load HR bot'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const handleSave = async () => {
    const uname = botUsername.trim();
    const tok = botToken.trim();
    if (!uname) { toast.error('Bot username is required'); return; }
    // Token is optional on update (lets admin tweak username/desc
    // without re-pasting the secret), required on first registration.
    if (!bot && !tok) { toast.error('Bot token is required when registering'); return; }
    setSaving(true);
    try {
      const saved = await hrBotApi.registerOrUpdate({
        botUsername: uname,
        // Keep the existing token when the user didn't paste a new
        // one — the backend overwrites whatever it received, so an
        // empty token would wipe it. We don't know the current
        // value (mask-only), so the only safe path is to require a
        // paste-in on every save. Token field stays empty after
        // load so the admin sees the requirement.
        botToken: tok,
        enabled,
        description: description.trim() || undefined,
      });
      setBot(saved);
      setBotToken('');
      toast.success(bot ? 'HR bot updated' : 'HR bot registered');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save HR bot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await hrBotApi.deleteBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setDescription('');
      setEnabled(false);
      setConfirmDelete(false);
      toast.success('HR bot removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove HR bot');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-sky-600" />
              HR Telegram Bot
            </DialogTitle>
            <DialogDescription>
              Register the bot employees use to receive payslips and run /checkin / /checkout.
              Create the bot in Telegram with <strong>@BotFather</strong>, paste the username
              and token here.
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
                      Token: <span className="font-mono">{bot.tokenMask}</span>
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
                  value={botUsername}
                  onChange={e => setBotUsername(e.target.value.replace(/^@/, ''))}
                  placeholder="MyCompanyHRBot"
                />
                <p className="text-[11px] text-gray-500">
                  The @username from @BotFather, without the leading @.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hrbot-token">Bot token {bot && <span className="text-gray-400 text-[11px]">(paste again to update)</span>}</Label>
                <Input
                  id="hrbot-token"
                  type="password"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hrbot-desc">Description <span className="text-gray-400 text-[11px]">(optional)</span></Label>
                <Input
                  id="hrbot-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="HR comms bot — payslip + attendance"
                />
              </div>

              <div className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <Label className="text-sm">Enable HR bot</Label>
                  <p className="text-[11px] text-gray-500">
                    Off keeps the row saved but pauses link generation and message delivery.
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <p className="text-[11px] text-amber-700">
                Phase 1: bot config + employee deep-link generation only. Live polling
                + /payslip / /checkin / /checkout commands land when the AI-Agent
                gains the HR worker.
              </p>
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
            <AlertDialogTitle>Remove HR bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The token row is deleted; new connect links can't be generated until you
              register a bot again. Already-linked employees stay linked.
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
