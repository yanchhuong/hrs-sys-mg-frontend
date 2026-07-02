import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { KeyRound, Landmark, Save, Loader2 } from 'lucide-react';
import * as payoutSettingsApi from '../../api/employeePayoutSettings';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fired after a successful save so parents can refresh any
   *  cached flag (e.g. the Beneficiary section's visibility gate). */
  onSaved?: (next: payoutSettingsApi.EmployeePayoutSettings) => void;
}

type Section = 'payway' | 'other-bank';

/**
 * Tenant-wide payout settings (V167). Two switches, each in its own
 * left-menu section so the choice + its surrounding copy stay
 * focused. Independent of any per-employee data — flipping these
 * toggles only changes which UI surfaces render on the Employee
 * dialog / Payroll page, never the underlying records.
 */
export function EmployeePayoutSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>('payway');
  const [paywayEnabled,  setPaywayEnabled]  = useState(true);
  const [allowOtherBank, setAllowOtherBank] = useState(true);

  // Re-fetch on every open so a settings change in another tab is
  // reflected immediately.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    payoutSettingsApi.get()
      .then(s => {
        setPaywayEnabled(s.paywayEnabled);
        setAllowOtherBank(s.allowOtherBank);
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load payout settings'))
      .finally(() => setLoading(false));
  }, [open]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await payoutSettingsApi.save({ paywayEnabled, allowOtherBank });
      toast.success('Payout settings saved');
      onSaved?.(next);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save payout settings');
    } finally {
      setSaving(false);
    }
  };

  const menu: { key: Section; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: 'payway',     label: 'PayWay',      hint: 'Beneficiary + payout via ABA PayWay', icon: <KeyRound className="h-4 w-4" /> },
    { key: 'other-bank', label: 'Other Banks', hint: 'Allow manual bank entry on employees', icon: <Landmark className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Employee Payout Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Tenant-wide toggles for PayWay payout integration and manual bank entries.
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
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : section === 'payway' ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">PayWay (ABA) integration</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  When on, the Employee dialog shows a <strong>Beneficiary</strong> section
                  where HR submits the employee's bank/wallet details to PayWay. PayWay
                  returns a Beneficiary ID that's stored on the employee record and reused
                  on every payroll run.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  When off, the Beneficiary section is hidden entirely and payroll never
                  calls PayWay. Useful for tenants who haven't onboarded with ABA yet,
                  or who pay staff through a different channel.
                </p>
                <label className="flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium cursor-pointer">
                      Enable PayWay payout
                    </Label>
                    <p className="text-[11px] text-gray-500">
                      Show the Beneficiary form + use PayWay's Payout API on payroll runs.
                    </p>
                  </div>
                  <Switch
                    checked={paywayEnabled}
                    onCheckedChange={setPaywayEnabled}
                    disabled={saving}
                  />
                </label>
                <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800 leading-snug">
                  PayWay credentials still need to be saved in <strong>Settings → PayWay</strong>
                  before payroll can dispatch successfully. This toggle only controls whether
                  the workflow surfaces — it doesn't add credentials.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Other banks (manual entry)</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  When on, an employee can be marked <strong>payout-ready</strong> with a plain
                  bank account recorded by HR — no PayWay registration required. Useful when
                  some staff are paid through banks PayWay doesn't support.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  When off, <strong>only</strong> a registered PayWay Beneficiary counts toward
                  payout readiness — strict mode for tenants who want every disbursement to
                  flow through the gateway.
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
                  <Switch
                    checked={allowOtherBank}
                    onCheckedChange={setAllowOtherBank}
                    disabled={saving}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
