import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Loader2, Bell, Send } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import * as accountingSettingsApi from '../../api/accountingSettings';

/**
 * Payment Plan reminder settings dialog.
 *
 * <p>Historically this dialog held two tabs: an Items catalogue and
 * a Reminders cadence editor. v-property-move (V287) promoted the
 * Items catalogue to a first-class page under Receivables → Property,
 * so this dialog is now Reminders-only. The gear button on the
 * Payment Plans page keeps its shape — a small popup — but the
 * left-nav Items / Reminders switcher is gone.</p>
 *
 * <p>Export name kept as {@code PaymentPlanItemsDialog} for
 * backwards compatibility with the single callsite; will rename in a
 * follow-up sweep alongside the file rename.</p>
 */
export function PaymentPlanItemsDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [settings, setSettings] = useState<accountingSettingsApi.AccountingSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving,  setSettingsSaving]  = useState(false);

  useEffect(() => {
    if (!open) return;
    setSettingsLoading(true);
    accountingSettingsApi.get('payment_plan')
      .then(setSettings)
      .catch(() => setSettings(accountingSettingsApi.defaultsFor('payment_plan')))
      .finally(() => setSettingsLoading(false));
  }, [open]);

  const patchSettings = (p: Partial<accountingSettingsApi.AccountingSettings>) =>
    setSettings(cur => (cur ? { ...cur, ...p } : cur));

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const saved = await accountingSettingsApi.update('payment_plan', settings);
      setSettings(saved);
      toast.success('Reminder settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSettingsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-600" />
            Payment Plan reminders
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Telegram cadence for schedule rows on active plans. Property catalogue lives on its own page now (Receivables → Property).
          </p>
        </DialogHeader>

        <div className="px-6 py-4 min-w-0 overflow-y-auto space-y-4">
          {settingsLoading || !settings ? (
            <div className="text-xs text-gray-500 italic text-center py-10">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading settings…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Before due</div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <Switch
                      checked={settings.ppReminderBeforeDueEnabled}
                      onCheckedChange={v => patchSettings({ ppReminderBeforeDueEnabled: v })}
                    />
                    Send a reminder
                  </label>
                  <span className="text-xs text-gray-500">
                    <Input
                      type="number" min={0} max={365}
                      value={settings.ppReminderBeforeDueDays}
                      onChange={e => patchSettings({ ppReminderBeforeDueDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                      className="inline-block w-16 h-7 text-xs text-right tabular-nums mx-1"
                      disabled={!settings.ppReminderBeforeDueEnabled}
                    />
                    day(s) before each installment's due date.
                  </span>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">After due</div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch
                    checked={settings.ppReminderAfterDueEnabled}
                    onCheckedChange={v => patchSettings({ ppReminderAfterDueEnabled: v })}
                  />
                  Chase installments that go past due
                </label>
                <div className="flex items-center gap-3 pl-8 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={settings.ppReminderAfterDueRepeat}
                      onCheckedChange={v => patchSettings({ ppReminderAfterDueRepeat: v })}
                      disabled={!settings.ppReminderAfterDueEnabled}
                    />
                    Keep re-sending
                  </label>
                  <Select
                    value={settings.ppReminderAfterDueFrequency}
                    onValueChange={v => patchSettings({ ppReminderAfterDueFrequency: v as 'daily' | 'weekly' })}
                    disabled={!settings.ppReminderAfterDueEnabled || !settings.ppReminderAfterDueRepeat}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Message template</div>
                <p className="text-[11px] text-gray-500">
                  Placeholders: <code>{'{customerName}'}</code>, <code>{'{planNo}'}</code>, <code>{'{installmentNo}'}</code>, <code>{'{termsCount}'}</code>, <code>{'{amount}'}</code>, <code>{'{dueDate}'}</code>
                </p>
                <Textarea
                  value={settings.ppReminderTemplate}
                  onChange={e => patchSettings({ ppReminderTemplate: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer pt-1">
                  <Switch
                    checked={settings.ppReminderResendSchedule}
                    onCheckedChange={v => patchSettings({ ppReminderResendSchedule: v })}
                  />
                  Also re-send the schedule summary alongside the reminder
                </label>
              </div>

              <div className="text-[11px] text-gray-500 italic">
                Reminders run daily at 09:15 server time. Only fires for customers who've linked their Telegram to this tenant, and only on schedules for <b>Active</b> plans with a positive balance.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSaveSettings} disabled={settingsSaving || !settings}>
            {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
