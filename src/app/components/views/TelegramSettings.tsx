import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Save, Trash2, RefreshCw, Link2, Copy, Check, AlertCircle, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchablePicker } from '../common/SearchablePicker';
import { useAuth } from '../../context/AuthContext';
import * as telegramApi from '../../api/telegram';
import * as customersApi from '../../api/customers';

/**
 * Settings → Telegram. One place to:
 *   • register the tenant's bot (username + token from @BotFather)
 *   • see which customers have linked their Telegram chat
 *   • mint a fresh deep-link URL for a customer who hasn't connected
 *
 * The token is write-only — once saved the API returns only the
 * last-4 tail for confirmation. To rotate, the admin pastes the new
 * one and saves; the old token is overwritten in place.
 */
export function TelegramSettings() {
  const { canUpdate, canDelete, canCreate } = useAuth();
  const canEdit   = canUpdate('telegram');
  const canRemove = canDelete('telegram');
  const canLink   = canCreate('telegram');

  /* ---------------------------- bot row ---------------------------- */

  const [bot, setBot] = useState<telegramApi.TelegramBot | null>(null);
  // Tenant-side resolved status: which bot is *actually* delivering
  // messages right now — own / platform fallback / none. Drives the
  // "Using shared bot" notice when the tenant hasn't registered one.
  const [status, setStatus] = useState<telegramApi.ResolvedBotStatus | null>(null);
  const [loadingBot, setLoadingBot] = useState(false);
  // Local UI mode — drives the segmented toggle AND credentials-card
  // visibility independently of whether the tenant has actually
  // registered an own bot. Initialised from the server's resolved
  // status; clicking the toggle updates this locally and (when
  // possible) fires the API to flip bot.enabled.
  //
  // The interesting case is "Custom Bot selected but no bot
  // registered yet" — the credentials card appears so the operator
  // can paste a token, and the subsequent Save defaults the new
  // row to enabled=true so it activates straight away.
  const [mode, setModeState] = useState<'auto' | 'custom'>('auto');

  // Edit-mode form state. Token is only sent when the user actually
  // types something — otherwise the existing token stays untouched.
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadBot = async () => {
    setLoadingBot(true);
    try {
      // Fetch both in parallel — tenants without their own bot have
      // a 204 on /bot but still need the status to show the shared-
      // bot fallback notice.
      const [next, st] = await Promise.all([
        telegramApi.getBot(),
        telegramApi.getStatus().catch(() => null),
      ]);
      setBot(next);
      setStatus(st);
      // Server is the source of truth on mount/refresh — match the
      // local toggle to whichever bot is actually delivering. Auto
      // when shared / none is active, Custom when the tenant's own
      // bot is in play.
      setModeState(st?.source === 'tenant' ? 'custom' : 'auto');
      if (next) {
        setBotUsername(next.botUsername);
        setEnabled(next.enabled);
        setDescription(next.description ?? '');
        setBotToken(''); // never pre-fill; token is write-only
      } else {
        // No own bot registered yet — initialise the form for a
        // fresh registration. Default to enabled=true so that when
        // the user is in Custom Bot mode (they had to actively pick
        // it to see this form) the save activates their bot
        // immediately, without a second click to flip the toggle.
        setBotUsername('');
        setBotToken('');
        setEnabled(true);
        setDescription('');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bot');
    } finally {
      setLoadingBot(false);
    }
  };
  useEffect(() => { void loadBot(); }, []);

  const saveBot = async () => {
    // Edit-mode validation: username always required, token required
    // when registering for the first time. When updating an existing
    // bot, an empty token field means "keep the stored token" — but
    // the backend doesn't support partial updates yet, so we re-send
    // the masked tail and the server rejects it. Force the admin to
    // re-enter the token on any save to keep the contract simple.
    if (!botUsername.trim()) {
      toast.error('Bot username is required');
      return;
    }
    if (!botToken.trim()) {
      toast.error(bot
        ? 'Re-enter the bot token to confirm the change (tokens are write-only).'
        : 'Bot token is required');
      return;
    }
    setSaving(true);
    try {
      const next = await telegramApi.putBot({
        botUsername: botUsername.trim(),
        botToken: botToken.trim(),
        enabled,
        description: description.trim() || undefined,
      });
      setBot(next);
      setBotToken('');
      toast.success('Telegram bot saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeBot = async () => {
    setSaving(true);
    try {
      await telegramApi.deleteBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setEnabled(false);
      setDescription('');
      setConfirmRemove(false);
      toast.success('Bot removed');
      // Refresh the resolved status so the "now using shared" notice
      // re-appears if the platform fallback is available.
      await loadBot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  };

  /** Segmented-toggle handler. {@code 'auto'} → use the Super-Admin
   *  shared bot; {@code 'custom'} → use the tenant's own bot.
   *
   *  <p>Two cases:</p>
   *  <ul>
   *    <li><b>Bot already registered</b> → flip {@code bot.enabled}
   *        via the dedicated /bot/enabled endpoint, no token re-entry.</li>
   *    <li><b>No bot yet + switching to Custom</b> → just flip the
   *        local mode; the credentials card appears so the operator
   *        can paste a token. The subsequent Save activates the bot.</li>
   *  </ul> */
  const setMode = async (next: 'auto' | 'custom') => {
    // No-op if already in the requested local mode — avoids a
    // pointless round trip on double-click.
    if (mode === next) return;
    // No bot registered — just update the local toggle, no API call.
    // The credentials card will appear (when next='custom') so the
    // operator can register their bot.
    if (!bot) {
      setModeState(next);
      return;
    }
    const wantEnabled = next === 'custom';
    if (bot.enabled === wantEnabled) {
      setModeState(next);
      return;
    }
    setSaving(true);
    try {
      const updated = await telegramApi.setBotEnabled(wantEnabled);
      setBot(updated);
      setEnabled(updated.enabled);
      setModeState(next);
      toast.success(wantEnabled ? 'Now using your own bot' : 'Switched to the shared bot');
      // Pull the fresh resolved status so the badge reflects reality.
      try { setStatus(await telegramApi.getStatus()); } catch { /* best-effort */ }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Switch failed');
    } finally {
      setSaving(false);
    }
  };

  /* --------------------- customers + linkage --------------------- */

  const [linked, setLinked] = useState<telegramApi.TelegramCustomer[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const loadLinked = async () => {
    setLoadingList(true);
    try {
      const [rows, cust] = await Promise.all([
        telegramApi.listLinkedCustomers(),
        customersApi.list({ size: 500 }),
      ]);
      setLinked(rows);
      setCustomers(cust.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load linked customers');
    } finally {
      setLoadingList(false);
    }
  };
  useEffect(() => { void loadLinked(); }, []);

  const customerById = useMemo(() => {
    const m = new Map<string, customersApi.Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  // Customers that are NOT yet linked — drives the "Generate link"
  // picker so an admin doesn't accidentally regenerate the link for
  // a customer who already connected.
  const unlinkedCustomers = useMemo(() => {
    const linkedIds = new Set(linked.map(l => l.customerId));
    return customers.filter(c => !linkedIds.has(c.id));
  }, [linked, customers]);

  const [linkTargetId, setLinkTargetId] = useState<string>('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{
    customerName: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    if (!linkTargetId) {
      toast.error('Pick a customer first');
      return;
    }
    // Either an own bot OR the platform fallback is enough — the
    // backend's resolveStatus() figures out which to use.
    if (!bot && status?.source !== 'platform') {
      toast.error('No bot available — register one or ask Super Admin to enable the platform fallback.');
      return;
    }
    setLinkBusy(true);
    try {
      const res = await telegramApi.generateLink(linkTargetId);
      const cName = customerById.get(linkTargetId)?.name ?? '';
      setLastLink({ customerName: cName, url: res.url, expiresAt: res.expiresAt });
      setLinkTargetId('');
      setCopied(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generate link failed');
    } finally {
      setLinkBusy(false);
    }
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink.url);
      setCopied(true);
      toast.success('Link copied');
      // Reset the "Copied" badge after a moment so the next click
      // feels like a fresh action.
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const unlink = async (customerId: string) => {
    try {
      await telegramApi.unlinkCustomer(customerId);
      toast.success('Customer unlinked');
      await loadLinked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed');
    }
  };

  /* ----------------------------- render ----------------------------- */

  // Reflects what the backend's resolveStatus says is actually
  // delivering messages — even when the tenant has an own bot, this
  // can be 'platform' because they've flipped the switch off.
  const usingOwn = status?.source === 'tenant';
  const usingPlatform = status?.source === 'platform';
  const platformAvailable = usingPlatform || (!!bot && status?.source !== 'platform');
  const activeUsername = status?.botUsername ?? null;

  return (
    <div className="space-y-6">
      {/* --- Active-bot card --- shows which bot is currently used to
          deliver invoices and lets the admin switch between their own
          bot (when registered) and the Super-Admin shared bot. By
          design the shared bot is the default — a freshly-registered
          own bot lands disabled and the admin has to flip this switch
          to start using it. */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Active bot</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadBot()} disabled={loadingBot}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingBot ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Segmented "Auto / Custom" toggle. Left = auto (use the
              Super-Admin shared platform bot), right = custom (use the
              tenant's own bot). The Custom side disables when no own
              bot is registered — clicking it nudges the operator to
              the credentials card below instead. */}
          <div className="inline-flex rounded-lg border bg-slate-100 p-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void setMode('auto')}
              disabled={!canEdit || saving || mode === 'auto'}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'auto'
                  ? 'bg-white shadow-sm text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              } disabled:cursor-not-allowed`}
              title="Use the shared platform bot"
            >
              Auto Bot
            </button>
            <button
              type="button"
              onClick={() => void setMode('custom')}
              disabled={!canEdit || saving || mode === 'custom'}
              className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === 'custom'
                  ? 'bg-white shadow-sm text-emerald-700'
                  : 'text-gray-500 hover:text-gray-700'
              } disabled:cursor-not-allowed`}
              title={bot
                ? 'Use your own bot'
                : 'Paste your @BotFather credentials in the card that appears below'}
            >
              Custom Bot
            </button>
          </div>

          {/* What's actually delivering, after the toggle resolves. */}
          {status?.source === 'none' ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                No bot is available. Register your own below or ask Super Admin to enable the shared platform bot.
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-slate-50 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge className={usingOwn
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-blue-100 text-blue-700 border-blue-200'}>
                  {usingOwn ? 'Custom Bot' : 'Auto Bot (shared)'}
                </Badge>
                {activeUsername && (
                  <a
                    href={`https://t.me/${activeUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-blue-700 hover:underline inline-flex items-center gap-0.5"
                  >
                    @{activeUsername} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="text-[11px] text-gray-500">
                {usingOwn
                  ? 'Customers see your company branding.'
                  : platformAvailable
                  ? 'Default for tenants without their own bot.'
                  : ''}
              </div>
            </div>
          )}

          {!bot && mode === 'custom' && (
            <div className="text-[11px] text-gray-500">
              Paste your @BotFather credentials in the card below and click <strong>Register Bot</strong> to start delivering through your own bot.
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Bot registration card --- visible only when the
          segmented toggle is set to Custom Bot. In Auto mode there's
          nothing for the operator to do with credentials, so we hide
          the entire form to keep the page focused. */}
      {mode === 'custom' && (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Bot credentials
                {bot && (
                  bot.enabled
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                    : <Badge variant="outline" className="text-gray-500">Disabled</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
                                    className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                  @BotFather <ExternalLink className="h-3 w-3" />
                </a>{' '}— paste the username and the long token it gives you.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadBot()} disabled={loadingBot}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingBot ? 'animate-spin' : ''}`} />
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
                placeholder="YourCompany_Invoice_Bot"
                className="font-mono"
                disabled={!canEdit || saving}
              />
              <div className="text-[10px] text-gray-500">
                As shown on Telegram, ending in "bot" (e.g. <code>ABC_Invoice_Bot</code>).
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
                disabled={!canEdit || saving}
                autoComplete="off"
              />
              <div className="text-[10px] text-gray-500">
                Stored encrypted; never displayed back in full.
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Memo to help you remember which bot this is."
              disabled={!canEdit || saving}
            />
            <div className="text-[10px] text-gray-500">
              Saving here registers your bot and activates it immediately. Switch to <strong>Auto Bot</strong> above any time to fall back to the shared bot.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <Button onClick={saveBot} disabled={saving}>
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? 'Saving…' : (bot ? 'Update Bot' : 'Register Bot')}
              </Button>
            )}
            {bot && canRemove && (
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

        </CardContent>
      </Card>
      )}

      {/* --- Generate link card --- */}
      {(bot || status?.source === 'platform') && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Connect a customer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <SearchablePicker
              value={linkTargetId}
              onChange={setLinkTargetId}
              placeholder="Pick a customer to connect"
              options={unlinkedCustomers.map(c => ({
                value: c.id,
                label: c.name,
                searchKey: `${c.name} ${c.phone ?? ''} ${c.tin ?? ''}`,
              }))}
            />
            <Button onClick={generateLink} disabled={!canLink || linkBusy || !linkTargetId}>
              <Link2 className="h-4 w-4 mr-1.5" />
              {linkBusy ? 'Generating…' : 'Generate link'}
            </Button>
          </div>

          {lastLink && (
            <div className="rounded-md border bg-slate-50 px-3 py-2.5 space-y-2">
              <div className="text-xs text-gray-600">
                Link for <span className="font-medium text-gray-900">{lastLink.customerName}</span> — expires {new Date(lastLink.expiresAt).toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <Input value={lastLink.url} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied
                    ? <><Check className="h-3.5 w-3.5 mr-1" /> Copied</>
                    : <><Copy className="h-3.5 w-3.5 mr-1" /> Copy</>}
                </Button>
              </div>
              <div className="text-[11px] text-gray-500">
                Send this link to the customer. After they click <strong>Start</strong>, refresh the list below.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* --- Connected customers --- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Connected customers</CardTitle>
              <CardDescription>
                {linked.length === 0
                  ? 'No customers have linked their Telegram chat yet.'
                  : `${linked.length} customer${linked.length === 1 ? '' : 's'} connected.`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadLinked()} disabled={loadingList}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingList ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {linked.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {bot
                ? 'Generate a link above and send it to a customer to get started.'
                : 'Register a bot first, then generate links for your customers.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Chat ID</TableHead>
                  <TableHead>Linked at</TableHead>
                  <TableHead className="text-right w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linked.map(l => {
                  const c = customerById.get(l.customerId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{c?.name ?? <span className="text-gray-400">(deleted)</span>}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          {l.telegramUsername
                            ? <span className="font-mono text-blue-700">@{l.telegramUsername}</span>
                            : <span className="text-gray-500">{l.displayName ?? '—'}</span>}
                          {l.botSource === 'platform' && (
                            <Badge variant="outline"
                                   className="text-[10px] border-blue-200 text-blue-700 bg-blue-50"
                                   title="Connected via the shared platform bot">
                              shared
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{l.chatId}</TableCell>
                      <TableCell className="text-sm text-gray-600">{new Date(l.linkedAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => void unlink(l.customerId)}
                          >
                            Unlink
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Telegram bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot row + all linked customer chats stay in the database, but the agent will stop polling immediately and no more invoices will be sent via Telegram. You can re-register at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeBot} className="bg-red-600 hover:bg-red-700" disabled={saving}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
