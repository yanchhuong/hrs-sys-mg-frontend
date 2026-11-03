import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Send, KeyRound, Landmark, Loader2, Save } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { HrTelegramBotCard } from './HrTelegramBotCard';
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
 *       tenant's HR Telegram bot. The form itself is
 *       {@link HrTelegramBotCard}, shared with Settings ▸ Telegram
 *       Bot so the two surfaces cannot drift (v-hr-bot-settings).</li>
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

  /* ---------- Payout settings state ---------- */
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [paywayEnabled, setPaywayEnabled] = useState(true);
  const [allowOtherBank, setAllowOtherBank] = useState(true);

  // Re-fetch on every open so a settings change in another tab is
  // reflected immediately. The HR bot section loads itself — see
  // HrTelegramBotCard, shared with Settings ▸ Telegram Bot.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

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
              {/* v-settings-menu-tooltip — hint moved to hover tooltip
                  so the sidebar reads as single-line labels. */}
              <TooltipProvider delayDuration={200}>
                {menu.map(m => {
                  const active = section === m.key;
                  return (
                    <Tooltip key={m.key}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSection(m.key)}
                          className={`w-full text-left rounded-md p-2 flex items-center gap-2 transition ${
                            active ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'
                          }`}
                        >
                          <span className={active ? 'text-blue-600' : 'text-gray-400'}>
                            {m.icon}
                          </span>
                          <span className={`flex-1 min-w-0 text-sm font-medium truncate ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                            {m.label}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs">
                        {m.hint}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </aside>

            <div className="p-6 overflow-y-auto">
              {section === 'hr-bot' && (
                <HrTelegramBotCard active={open && showHrBot} />
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
        </DialogContent>
      </Dialog>

    </>
  );
}
