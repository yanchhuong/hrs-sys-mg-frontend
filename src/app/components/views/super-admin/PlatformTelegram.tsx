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
  Users, Briefcase, AlertTriangle, Send, Wrench,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { toast } from 'sonner';
import * as telegramApi from '../../../api/telegram';
import { TableBodySkeletonRows } from '../../common/LoadingSkeletons';

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

  // V276 — error-bot dialog is a sibling of the Public dialog. Keeps
  // its own state so the two forms don't stomp on each other when the
  // Super Admin toggles between them.
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorConfirmRemove, setErrorConfirmRemove] = useState(false);
  const [errorSaving, setErrorSaving] = useState(false);
  const [errorTesting, setErrorTesting] = useState(false);
  const [errUsername, setErrUsername] = useState('');
  const [errToken, setErrToken] = useState('');
  const [errChatId, setErrChatId] = useState('');
  const [errEnabled, setErrEnabled] = useState(true);
  const [errSkipTypes, setErrSkipTypes] = useState('');
  const [errDescription, setErrDescription] = useState('');

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
  const errorBot = useMemo(
    () => rows.find(r => r.kind === 'error') ?? null,
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

  /* ---------------------- Error bot (V276) --------------------- */

  const DEFAULT_SKIP =
    'NotFoundException,BadRequestException,ValidationException,'
    + 'MethodArgumentNotValidException,HttpMessageNotReadableException,'
    + 'ResponseStatusException,MissingServletRequestParameterException,'
    + 'MethodArgumentTypeMismatchException';

  const openAddError = () => {
    setErrUsername('');
    setErrToken('');
    setErrChatId('');
    setErrEnabled(true);
    setErrSkipTypes(DEFAULT_SKIP);
    setErrDescription('');
    setErrorDialogOpen(true);
  };
  const openEditError = () => {
    if (!errorBot) { openAddError(); return; }
    setErrUsername(errorBot.botUsername);
    setErrToken('');
    setErrChatId(errorBot.chatId ?? '');
    setErrEnabled(errorBot.enabled);
    setErrSkipTypes(errorBot.skipTypes ?? DEFAULT_SKIP);
    setErrDescription(errorBot.description ?? '');
    setErrorDialogOpen(true);
  };

  const saveError = async () => {
    if (!errUsername.trim()) { toast.error('Bot username is required'); return; }
    if (!errToken.trim()) {
      toast.error(errorBot
        ? 'Re-enter the bot token to confirm (tokens are write-only).'
        : 'Bot token is required');
      return;
    }
    if (!errChatId.trim()) { toast.error('Chat ID is required'); return; }
    setErrorSaving(true);
    try {
      await telegramApi.putErrorBot({
        botUsername: errUsername.trim(),
        botToken: errToken.trim(),
        chatId: errChatId.trim(),
        enabled: errEnabled,
        skipTypes: errSkipTypes.trim() || undefined,
        description: errDescription.trim() || undefined,
      });
      toast.success(errorBot ? 'Error bot updated' : 'Error bot registered');
      setErrorDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setErrorSaving(false);
    }
  };

  const removeError = async () => {
    setErrorSaving(true);
    try {
      await telegramApi.deleteErrorBot();
      toast.success('Error bot removed');
      setErrorConfirmRemove(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setErrorSaving(false);
    }
  };

  const testError = async () => {
    setErrorTesting(true);
    try {
      const res = await telegramApi.testErrorBot();
      if (res.ok) toast.success(res.message ?? 'Test message sent.');
      else toast.error(res.message ?? 'Test send failed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test send failed.');
    } finally {
      setErrorTesting(false);
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
                    are owned by tenants and listed here for visibility.{' '}
                    <span className="font-medium text-red-700">Error</span> bot receives
                    unhandled server exceptions to a Super-Admin ops channel.
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
          {!errorBot && (
            <Button
              onClick={openAddError}
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Error Bot
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
                <TableBodySkeletonRows rows={5} columns={8} />
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500 py-8">
                    No bots registered yet. Click <strong>Add Public Bot</strong> for the shared customer fallback,
                    or <strong>Add Error Bot</strong> to receive unhandled server errors on Telegram.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => {
                const isPlatform = b.kind === 'platform';
                const isError = b.kind === 'error';
                const isEmployee = b.audience === 'employee';
                const isOps = b.audience === 'ops';
                return (
                  <TableRow key={`${b.kind}:${b.audience}:${b.tenantId ?? b.kind}`}>
                    <TableCell>
                      {isError ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Error
                        </Badge>
                      ) : isPlatform ? (
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
                      {/* Customer vs Employee vs Ops audience —
                          different worker, different commands,
                          different chat identities. Operator should
                          be able to scan the column at a glance to
                          spot which side a tenant has wired up. */}
                      {isOps ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                          <Wrench className="h-3 w-3" /> Ops
                        </Badge>
                      ) : isEmployee ? (
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
                      {isError
                        ? <span className="text-gray-400">— (ops channel)</span>
                        : isPlatform
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
                      {isError ? (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => void testError()}
                            disabled={errorTesting}
                            title="Send a test message to the ops channel"
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            {errorTesting ? 'Sending…' : 'Test'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={openEditError}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setErrorConfirmRemove(true)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : isPlatform ? (
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

      {/* V276 — Error-tracking bot dialog. Extra fields (Chat ID +
          Skip Types) don't apply to the tenant/customer flavours, so
          this lives as its own dialog rather than a conditional
          branch inside the Public dialog above. */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              {errorBot ? 'Edit Error Bot' : 'Register Error Bot'}
            </DialogTitle>
            <DialogDescription>
              Unhandled server errors will be posted to the chat below.
              Create the bot via{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
                 className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                @BotFather <ExternalLink className="h-3 w-3" />
              </a>{' '}
              then paste the credentials. The Chat ID is the numeric id of the
              destination user or group (start a chat with{' '}
              <a href="https://t.me/getidsbot" target="_blank" rel="noreferrer"
                 className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                @getidsbot <ExternalLink className="h-3 w-3" />
              </a>{' '}
              to grab it).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Bot username</Label>
                <Input
                  value={errUsername}
                  onChange={e => setErrUsername(e.target.value)}
                  placeholder="HRMS_Error_Bot"
                  className="tabular-nums"
                  disabled={errorSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Bot token {errorBot && (
                    <span className="text-[10px] text-gray-400 ml-1">
                      (current: <code>{errorBot.tokenTail}</code> — re-enter to update)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={errToken}
                  onChange={e => setErrToken(e.target.value)}
                  placeholder={errorBot ? 'Re-enter to confirm or paste a new token' : '123456:AAH...'}
                  className="tabular-nums"
                  disabled={errorSaving}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
              <div className="space-y-1.5">
                <Label className="text-xs">Chat ID</Label>
                <Input
                  value={errChatId}
                  onChange={e => setErrChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="tabular-nums"
                  disabled={errorSaving}
                />
                <div className="text-[10px] text-gray-500">
                  Numeric id (negative for groups / channels, positive for a direct user chat).
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enabled</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch checked={errEnabled} onCheckedChange={setErrEnabled} disabled={errorSaving} />
                  <span className="text-xs text-gray-500">
                    {errEnabled ? 'Notifying on 500s' : 'Disabled — no messages sent'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Skip exception types</Label>
              {/* v-error-bot-textarea-wrap — the default value is a
                  long comma-separated token with no whitespace, which
                  browsers don't soft-wrap; that pushed the whole
                  dialog into horizontal overflow. break-all forces
                  the wrap so the content stays inside the textarea. */}
              <Textarea
                rows={3}
                value={errSkipTypes}
                onChange={e => setErrSkipTypes(e.target.value)}
                placeholder="NotFoundException,ValidationException,..."
                disabled={errorSaving}
                className="font-mono text-xs break-all"
              />
              <div className="text-[10px] text-gray-500">
                Comma-separated exception <em>simple</em> names. These won't fire the bot
                (e.g. user-input 400s stay off the ops channel).
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                rows={2}
                value={errDescription}
                onChange={e => setErrDescription(e.target.value)}
                placeholder="Memo — visible only to Super Admin."
                disabled={errorSaving}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorDialogOpen(false)} disabled={errorSaving}>
              Cancel
            </Button>
            <Button
              onClick={saveError}
              disabled={errorSaving}
              className="bg-red-600 hover:bg-red-700"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {errorSaving ? 'Saving…' : (errorBot ? 'Update Bot' : 'Register Bot')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={errorConfirmRemove} onOpenChange={setErrorConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove error bot?</AlertDialogTitle>
            <AlertDialogDescription>
              Unhandled server errors will no longer be posted to Telegram
              until you register a new one. The application keeps running
              — only the notifier is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={errorSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeError}
              className="bg-red-600 hover:bg-red-700"
              disabled={errorSaving}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
