import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Bot, Save, Trash2, RefreshCw, AlertCircle, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import * as telegramApi from '../../../api/telegram';

/**
 * Super-Admin-only page for the singleton platform-wide Telegram
 * bot. Tenants who haven't registered their own bot fall back to
 * this one automatically — no per-tenant config needed. Disabling
 * (or unregistering) the platform bot just means those tenants
 * lose Telegram delivery until they register their own.
 *
 * Same write-only token handling as the tenant Settings page —
 * the API returns only the last-4 tail; rotating means pasting
 * the new token.
 */
export function PlatformTelegram() {
  const [bot, setBot] = useState<telegramApi.PlatformTelegramBot | null>(null);
  const [loading, setLoading] = useState(false);

  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await telegramApi.getPlatformBot();
      setBot(next);
      if (next) {
        setBotUsername(next.botUsername);
        setEnabled(next.enabled);
        setDescription(next.description ?? '');
        setBotToken('');
      } else {
        setBotUsername('');
        setBotToken('');
        setEnabled(true);
        setDescription('');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load platform bot');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!botUsername.trim()) {
      toast.error('Bot username is required');
      return;
    }
    if (!botToken.trim()) {
      toast.error(bot
        ? 'Re-enter the bot token to confirm (tokens are write-only).'
        : 'Bot token is required');
      return;
    }
    setSaving(true);
    try {
      const next = await telegramApi.putPlatformBot({
        botUsername: botUsername.trim(),
        botToken: botToken.trim(),
        enabled,
        description: description.trim() || undefined,
      });
      setBot(next);
      setBotToken('');
      toast.success('Platform bot saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await telegramApi.deletePlatformBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setEnabled(true);
      setDescription('');
      setConfirmRemove(false);
      toast.success('Platform bot removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="bg-blue-50 p-2 rounded-md">
          <Bot className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Platform Telegram Bot</h1>
          <p className="text-sm text-gray-500">
            Shared fallback bot for tenants who haven't registered their own. Every tenant
            without a bot in <em>Settings → Telegram</em> will use this one to deliver invoices.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Shared bot credentials
                {bot && (
                  bot.enabled
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                    : <Badge variant="outline" className="text-gray-500">Disabled</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Create the platform bot via{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
                   className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  @BotFather <ExternalLink className="h-3 w-3" />
                </a>
                {' '}and paste the username + token below. Tenants will see this bot's identity to their customers.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Bot username</Label>
              <Input
                value={botUsername}
                onChange={e => setBotUsername(e.target.value)}
                placeholder="HRMS_Platform_Bot"
                className="font-mono"
                disabled={saving}
              />
              <div className="text-[10px] text-gray-500">
                Must end in "bot" (e.g. <code>HRMS_Platform_Bot</code>). Cannot be a username already claimed by a tenant.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Bot token {bot && (
                  <span className="text-[10px] text-gray-400 ml-1">
                    (current: <code>{bot.tokenTail}</code> — re-enter to update)
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder={bot ? 'Re-enter to confirm or paste a new token' : '123456:AAH...'}
                className="font-mono"
                disabled={saving}
                autoComplete="off"
              />
              <div className="text-[10px] text-gray-500">
                Stored encrypted; never echoed back in full.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Memo for Super Admin — visible only on this page."
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Enabled</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
                <span className="text-xs text-gray-500">
                  {enabled ? 'Polling active' : 'Disabled — tenants fall through to "no bot"'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Saving…' : (bot ? 'Update Bot' : 'Register Bot')}
            </Button>
            {bot && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setConfirmRemove(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remove bot
              </Button>
            )}
            {bot && (
              <a
                href={`https://t.me/${bot.botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                Open t.me/{bot.botUsername} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!bot && !loading && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                No platform bot registered. Tenants without their own bot will see "Telegram delivery not available" until you set one up.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove platform bot?</AlertDialogTitle>
            <AlertDialogDescription>
              Tenants who relied on the shared bot will stop receiving Telegram messages until you register a new one (or until they register their own).
              Existing linked customer chats will not be deleted — they just won't receive new messages from this bot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-red-600 hover:bg-red-700"
              disabled={saving}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
