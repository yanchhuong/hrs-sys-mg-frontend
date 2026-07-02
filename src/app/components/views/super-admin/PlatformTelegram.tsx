import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  Bot, Save, Trash2, RefreshCw, ExternalLink, Plus, Pencil, Globe, Building2, Info,
  Users, Briefcase,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { toast } from 'sonner';
import * as telegramApi from '../../../api/telegram';

/**
 * Super-Admin "Telegram Bots" page.
 *
 * <p>Two flavours of bot share this table:</p>
 * <ul>
 *   <li><b>Public</b> — the singleton platform fallback the Super
 *       Admin owns. Tenants who haven't registered their own bot use
 *       it automatically. Editable here.</li>
 *   <li><b>Private</b> — per-tenant customer bots. Listed for
 *       visibility; credential rotation stays with the tenant
 *       (Settings → Customers → Telegram Bot), so the row exposes
 *       status + username + token tail only.</li>
 * </ul>
 *
 * <p>Add / Edit on the Public row opens a dialog with the same
 * write-only token field as the tenant form — pasting a fresh secret
 * is the only way to rotate, since the API never echoes the full
 * token back.</p>
 */
export function PlatformTelegram() {
  const [rows, setRows] = useState<telegramApi.PlatformBotListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit-dialog form state. Mirrors the previous in-page form but
  // lives in the dialog now. Reset on every open from the current
  // platform row so re-opening doesn't carry stale typed values.
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await telegramApi.listAllBots());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  // Platform row lookup — null when not yet registered. Used both
  // to show the "Add" CTA and to prefill the edit dialog. There's
  // only one platform bot today (customer-audience); a platform HR
  // bot would slot in here as a second row if that lands later.
  const platformBot = useMemo(
    () => rows.find(r => r.kind === 'platform') ?? null,
    [rows],
  );
  const tenantBots = useMemo(
    () => rows.filter(r => r.kind === 'tenant'),
    [rows],
  );

  const openAdd = () => {
    setBotUsername('');
    setBotToken('');
    setEnabled(true);
    setDescription('');
    setDialogOpen(true);
  };
  const openEdit = () => {
    if (!platformBot) { openAdd(); return; }
    setBotUsername(platformBot.botUsername);
    setBotToken('');
    setEnabled(platformBot.enabled);
    setDescription(platformBot.description ?? '');
    setDialogOpen(true);
  };

  const save = async () => {
    if (!botUsername.trim()) {
      toast.error('Bot username is required');
      return;
    }
    if (!botToken.trim()) {
      toast.error(platformBot
        ? 'Re-enter the bot token to confirm (tokens are write-only).'
        : 'Bot token is required');
      return;
    }
    setSaving(true);
    try {
      await telegramApi.putPlatformBot({
        botUsername: botUsername.trim(),
        botToken: botToken.trim(),
        enabled,
        description: description.trim() || undefined,
      });
      toast.success(platformBot ? 'Platform bot updated' : 'Platform bot registered');
      setDialogOpen(false);
      await load();
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
      toast.success('Platform bot removed');
      setConfirmRemove(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-blue-50 p-2 rounded-md">
            <Bot className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Telegram Bots
              {/* Verbose intro lives behind an Info hover so the
                  header stays compact for the return visit (Super
                  Admin already knows the Public/Private split), while
                  first-timers still get the explanation one hover
                  away. Matches the tooltip pattern used on
                  CustomerTelegramBotSettingsDialog. */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="About this page"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    One <span className="font-medium text-blue-700">Public</span> shared
                    bot belongs to Super Admin and falls back for every tenant without
                    their own.{' '}
                    <span className="font-medium text-purple-700">Private</span> bots
                    are owned by tenants and listed here for visibility.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!platformBot && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Public Bot
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Type</TableHead>
                <TableHead className="w-[130px]">Audience</TableHead>
                <TableHead>Bot username</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="w-[100px]">Token</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[170px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                    No bots registered yet. Click <strong>Add Public Bot</strong> to set up the shared fallback.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => {
                const isPlatform = b.kind === 'platform';
                const isEmployee = b.audience === 'employee';
                return (
                  <TableRow key={`${b.kind}:${b.audience}:${b.tenantId ?? 'platform'}`}>
                    <TableCell>
                      {isPlatform ? (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
                          <Globe className="h-3 w-3" /> Public
                        </Badge>
                      ) : (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
                          <Building2 className="h-3 w-3" /> Private
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Customer vs Employee audience — different
                          worker, different commands, different chat
                          identities. Operator should be able to scan
                          the column at a glance to spot which side a
                          tenant has wired up. */}
                      {isEmployee ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                          <Briefcase className="h-3 w-3" /> Employee
                        </Badge>
                      ) : (
                        <Badge className="bg-sky-100 text-sky-700 border-sky-200 gap-1">
                          <Users className="h-3 w-3" /> Customer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      <a
                        href={`https://t.me/${b.botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        {b.botUsername}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-sm">
                      {isPlatform
                        ? <span className="text-gray-400">— (shared)</span>
                        : <span className="text-gray-700">{b.tenantName ?? '(unknown)'}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-gray-500">
                      {b.tokenTail || '—'}
                    </TableCell>
                    <TableCell>
                      {b.enabled
                        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                        : <Badge variant="outline" className="text-gray-500">Disabled</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-[280px] truncate"
                               title={b.description ?? ''}>
                      {b.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPlatform ? (
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={openEdit}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setConfirmRemove(true)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        // Private rows are read-only here — the
                        // tenant rotates their own token in Settings →
                        // Customers → Telegram Bot. We don't surface
                        // an edit affordance to keep the boundary crisp.
                        <span className="text-xs text-gray-400">Tenant-owned</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-600" />
              {platformBot ? 'Edit Public Bot' : 'Register Public Bot'}
            </DialogTitle>
            <DialogDescription>
              Create the platform bot via{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
                 className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                @BotFather <ExternalLink className="h-3 w-3" />
              </a>
              {' '}then paste the username and token. Tenants with no bot of
              their own will deliver invoices through this one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Bot username</Label>
                <Input
                  value={botUsername}
                  onChange={e => setBotUsername(e.target.value)}
                  placeholder="HRMS_Platform_Bot"
                  className="tabular-nums"
                  disabled={saving}
                />
                <div className="text-[10px] text-gray-500">
                  Must end in "bot" (e.g. <code>HRMS_Platform_Bot</code>). Cannot be a username already claimed by a tenant.
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Bot token {platformBot && (
                    <span className="text-[10px] text-gray-400 ml-1">
                      (current: <code>{platformBot.tokenTail}</code> — re-enter to update)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder={platformBot ? 'Re-enter to confirm or paste a new token' : '123456:AAH...'}
                  className="tabular-nums"
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Saving…' : (platformBot ? 'Update Bot' : 'Register Bot')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove platform bot?</AlertDialogTitle>
            <AlertDialogDescription>
              Tenants who relied on the shared bot ({tenantBots.length === 0
                ? 'none currently'
                : `${tenantBots.length} tenant${tenantBots.length === 1 ? '' : 's'} have their own`})
              will stop receiving Telegram messages until you register a new one
              (or until they register their own). Existing linked customer chats
              are not deleted — they just won't receive new messages from this bot.
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
