import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { Send, KeyRound, Landmark, Trash2, Loader2, Save, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as hrBotApi from '../../api/hrTelegramBots';
import * as payoutSettingsApi from '../../api/employeePayoutSettings';

type Section = 'hr-bot' | 'payway' | 'other-bank';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional gate — when false, the HR Bot section is hidden so the
   *  dialog still renders for tenants with payout perms but no
   *  hr_telegram perm. */
  showHrBot?: boolean;
  /** Fired after a payout settings save so the parent can refresh
   *  any cached flag (e.g. payable chip on the roster). */
  onPayoutSaved?: (next: payoutSettingsApi.EmployeePayoutSettings) => void;
}

/**
 * Unified Employee Settings dialog. Replaces the standalone
 * HrTelegramBotSettingsDialog + EmployeePayoutSettingsDialog with a
 * single left-menu surface so HR doesn't hunt across two gear icons.
 *
 * <ul>
 *   <li><b>HR Bot</b> — register / update / toggle / remove the
 *       tenant's HR Telegram bot. Same logic as the old standalone
 *       dialog (load → form → Save → optional Remove via AlertDialog).</li>
 *   <li><b>PayWay</b> — toggle PayWay payout integration on/off.</li>
 *   <li><b>Other Banks</b> — toggle whether manual bank entries are
 *       accepted as a payout source.</li>
 * </ul>
 *
 * <p>Each section owns its own Save action so the user can edit one
 * area without confirming changes in another — same pattern the
 * AccountingSettingsDialog uses.</p>
 */
export function EmployeeSettingsDialog({ open, onOpenChange, showHrBot = true, onPayoutSaved }: Props) {
  const [section, setSection] = useState<Section>(showHrBot ? 'hr-bot' : 'payway');

  /* ---------- HR Bot section state ---------- */
  const [bot, setBot] = useState<hrBotApi.HrTelegramBot | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botSaving, setBotSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botDescription, setBotDescription] = useState('');
  const [botEnabled, setBotEnabled] = useState(false);

  /* ---------- Payout settings state ---------- */
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [paywayEnabled, setPaywayEnabled] = useState(true);
  const [allowOtherBank, setAllowOtherBank] = useState(true);

  // Re-fetch on every open so a settings change in another tab is
  // reflected immediately. Both endpoints fire in parallel; either
  // can fail without taking the dialog down.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (showHrBot) {
      setBotLoading(true);
      hrBotApi.getBot()
        .then(b => {
          if (cancelled) return;
          setBot(b);
          setBotUsername(b?.botUsername ?? '');
          setBotToken('');
          setBotDescription(b?.description ?? '');
          setBotEnabled(b?.enabled ?? false);
        })
        .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load HR bot'))
        .finally(() => { if (!cancelled) setBotLoading(false); });
    }

    setPayoutLoading(true);
    payoutSettingsApi.get()
      .then(s => {
        if (cancelled) return;
        setPaywayEnabled(s.paywayEnabled);
        setAllowOtherBank(s.allowOtherBank);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load payout settings'))
      .finally(() => { if (!cancelled) setPayoutLoading(false); });

    return () => { cancelled = true; };
  }, [open, showHrBot]);

  /* ---------- HR Bot handlers ---------- */
  const saveBot = async () => {
    const uname = botUsername.trim();
    const tok = botToken.trim();
    if (!uname) { toast.error('Bot username is required'); return; }
    if (!bot && !tok) { toast.error('Bot token is required when registering'); return; }
    setBotSaving(true);
    try {
      const saved = await hrBotApi.registerOrUpdate({
        botUsername: uname,
        botToken: tok,
        enabled: botEnabled,
        description: botDescription.trim() || undefined,
      });
      setBot(saved);
      setBotToken('');
      toast.success(bot ? 'HR bot updated' : 'HR bot registered');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save HR bot');
    } finally {
      setBotSaving(false);
    }
  };

  const deleteBot = async () => {
    try {
      await hrBotApi.deleteBot();
      setBot(null);
      setBotUsername('');
      setBotToken('');
      setBotDescription('');
      setBotEnabled(false);
      setConfirmDelete(false);
      toast.success('HR bot removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove HR bot');
    }
  };

  /* ---------- Payout settings handlers ---------- */
  const savePayout = async () => {
    setPayoutSaving(true);
    try {
      const next = await payoutSettingsApi.save({ paywayEnabled, allowOtherBank });
      toast.success('Payout settings saved');
      onPayoutSaved?.(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save payout settings');
    } finally {
      setPayoutSaving(false);
    }
  };

  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    ...(showHrBot ? [
      { key: 'hr-bot' as Section,     label: 'HR Bot',      hint: 'Telegram bot for payslip + attendance',  icon: <Send className="h-4 w-4" /> },
    ] : []),
    { key: 'payway' as Section,       label: 'PayWay',      hint: 'Beneficiary + payout via ABA PayWay',     icon: <KeyRound className="h-4 w-4" /> },
    { key: 'other-bank' as Section,   label: 'Other Banks', hint: 'Allow manual bank entry on employees',    icon: <Landmark className="h-4 w-4" /> },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>Employee Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Per-tenant configuration for the HR Telegram bot and the PayWay payout pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[200px_1fr] flex-1 min-h-0">
            <aside className="border-r bg-gray-50/60 p-2 overflow-y-auto">
              {menu.map(m => {
                const active = section === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSection(m.key)}
                    className={`w-full text-left rounded-md p-2 flex items-start gap-2 transition ${
                      active ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 mt-0.5' : 'text-gray-400 mt-0.5'}>
                      {m.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                        {m.label}
                      </span>
                      <span className="block text-[11px] text-gray-500 truncate">{m.hint}</span>
                    </span>
                  </button>
                );
              })}
            </aside>

            <div className="p-6 overflow-y-auto">
              {section === 'hr-bot' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                    <Send className="h-4 w-4 text-sky-600" />
                    HR Telegram bot
                    {/* Description moved into a hover tooltip — keeps
                        the section header compact on the return visit
                        while first-timers can still surface the
                        @BotFather pointer one hover away. */}
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
                          Register the bot employees use to receive payslips and run
                          {' '}<code>/checkin</code> / <code>/checkout</code>. Create the bot in Telegram with
                          {' '}<strong>@BotFather</strong>, paste the username and token here.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h3>

                  {botLoading ? (
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
                        <Switch checked={botEnabled} onCheckedChange={setBotEnabled} disabled={botSaving} />
                      </label>

                      <div className="flex items-center justify-between gap-2 pt-2">
                        {bot ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => setConfirmDelete(true)}
                            disabled={botSaving}
                          >
                            <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                          </Button>
                        ) : <span />}
                        <Button onClick={saveBot} disabled={botSaving || botLoading} size="sm">
                          {botSaving
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Save className="h-4 w-4 mr-1.5" />}
                          {bot ? 'Update bot' : 'Register bot'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'payway' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-blue-600" />
                    PayWay (ABA) integration
                  </h3>
                  {payoutLoading ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        When on, the Employee dialog shows a <strong>Beneficiary</strong> section
                        where HR submits the employee's bank/wallet details to PayWay. PayWay returns
                        a Beneficiary ID stored on the employee record and reused on every payroll run.
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        When off, the Beneficiary section is hidden entirely and payroll never calls
                        PayWay. Useful for tenants who haven't onboarded with ABA yet.
                      </p>
                      <label className="flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium cursor-pointer">Enable PayWay payout</Label>
                          <p className="text-[11px] text-gray-500">
                            Show the Beneficiary form + use PayWay's Payout API on payroll runs.
                          </p>
                        </div>
                        <Switch checked={paywayEnabled} onCheckedChange={setPaywayEnabled} disabled={payoutSaving} />
                      </label>
                      <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
                        PayWay credentials still need to be saved in <strong>Settings → PayWay</strong> before
                        payroll can dispatch successfully. This toggle only controls whether the workflow
                        surfaces — it doesn't add credentials.
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={savePayout} disabled={payoutSaving || payoutLoading} size="sm">
                          {payoutSaving
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Save className="h-4 w-4 mr-1.5" />}
                          Save
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'other-bank' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
                    <Landmark className="h-4 w-4 text-amber-600" />
                    Other banks (manual entry)
                  </h3>
                  {payoutLoading ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        When on, an employee can be marked <strong>payout-ready</strong> with a plain bank
                        account recorded by HR — no PayWay registration required. Useful when some staff
                        are paid through banks PayWay doesn't support.
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        When off, <strong>only</strong> a registered PayWay Beneficiary counts toward
                        payout readiness — strict mode for tenants who want every disbursement to flow
                        through the gateway.
                      </p>
                      <label className="flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium cursor-pointer">
                            Allow non-PayWay bank entries
                          </Label>
                          <p className="text-[11px] text-gray-500">
                            Accept manual bank accounts as a payout source alongside PayWay beneficiaries.
                          </p>
                        </div>
                        <Switch checked={allowOtherBank} onCheckedChange={setAllowOtherBank} disabled={payoutSaving} />
                      </label>
                      <div className="flex justify-end">
                        <Button onClick={savePayout} disabled={payoutSaving || payoutLoading} size="sm">
                          {payoutSaving
                            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            : <Save className="h-4 w-4 mr-1.5" />}
                          Save
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove HR bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The token row is deleted; new connect links can't be generated until you register a bot
              again. Already-linked employees stay linked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteBot} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
