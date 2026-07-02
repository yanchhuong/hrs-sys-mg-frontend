import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Wallet, Loader2, CheckCircle2, AlertCircle, Archive } from 'lucide-react';
import * as beneficiaryApi from '../../api/paywayBeneficiary';
import * as payoutSettingsApi from '../../api/employeePayoutSettings';

interface Props {
  /** The employee being edited. Section is hidden when null
   *  (the parent's create flow doesn't have an ID yet — we wait
   *  until after first save). */
  employeeId: string | null;
  /** Defaults the form's full-name field when no row exists yet. */
  employeeName?: string;
  /** Defaults the form's phone field when no row exists yet. */
  employeePhone?: string;
  /** Disable submit when the employee record itself is read-only
   *  (e.g. archived employee, no update perm). */
  readOnly?: boolean;
}

/**
 * Per-employee PayWay beneficiary form (V168). Mounted inside the
 * Employee dialog when the tenant has {@code paywayEnabled=true}
 * in Employee Payout Settings.
 *
 * <p><b>Stage 1 — stubbed gateway.</b> The backend's Add Beneficiary
 * call returns a synthetic {@code BEN0xxxxxx} ID; once the real
 * PayWay endpoint is wired, only the BE service swaps. This UI
 * stays as-is.</p>
 */
export function EmployeeBeneficiarySection({
  employeeId, employeeName = '', employeePhone = '', readOnly = false,
}: Props) {
  const [enabled, setEnabled] = useState(true);
  const [beneficiary, setBeneficiary] = useState<beneficiaryApi.PayWayBeneficiary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Form fields — pre-populated from an existing registration when
  // present, or from the employee record defaults on a fresh add.
  const [fullName, setFullName] = useState('');
  const [bank, setBank] = useState<string>('ABA');
  const [accountNumber, setAccountNumber] = useState('');
  const [phone, setPhone] = useState('');

  // Load tenant settings — hide the whole section when PayWay is
  // disabled at the tenant level. Soft-fail to "enabled" if the
  // settings call errors so a transient blip doesn't hide the form.
  useEffect(() => {
    payoutSettingsApi.get()
      .then(s => setEnabled(s.paywayEnabled))
      .catch(() => setEnabled(true));
  }, []);

  // Fetch existing registration when an employeeId is known. Clear
  // on employee change so switching between employees in a wizard
  // never bleeds data between rows.
  useEffect(() => {
    if (!employeeId) {
      setBeneficiary(null);
      return;
    }
    setLoading(true);
    beneficiaryApi.getForEmployee(employeeId)
      .then(b => {
        setBeneficiary(b);
        if (b) {
          setFullName(b.fullName);
          setBank(b.bank);
          setAccountNumber(b.accountNumber);
          setPhone(b.phone ?? '');
        } else {
          // Fresh registration — seed from the employee record so
          // HR doesn't have to retype the obvious bits.
          setFullName(employeeName);
          setBank('ABA');
          setAccountNumber('');
          setPhone(employeePhone);
        }
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load beneficiary'))
      .finally(() => setLoading(false));
  }, [employeeId, employeeName, employeePhone]);

  if (!enabled) return null;
  if (!employeeId) {
    return (
      <div className="rounded-md border border-dashed bg-gray-50 px-4 py-3 text-xs text-gray-500">
        Save the employee first to register their PayWay beneficiary.
      </div>
    );
  }

  const submit = async () => {
    if (saving || readOnly) return;
    if (!fullName.trim()) { toast.error('Full name is required.'); return; }
    if (!accountNumber.trim()) { toast.error('Account number is required.'); return; }
    setSaving(true);
    try {
      const next = await beneficiaryApi.submit({
        employeeId,
        fullName: fullName.trim(),
        bank: bank.trim().toUpperCase(),
        accountNumber: accountNumber.trim(),
        phone: phone.trim() || undefined,
      });
      setBeneficiary(next);
      if (next.status === 'active') {
        toast.success(`Beneficiary registered: ${next.beneficiaryId}`);
      } else if (next.status === 'failed') {
        toast.error(`PayWay rejected: ${next.rawResponse ?? 'unknown error'}`);
      } else {
        toast.info(`Beneficiary status: ${next.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Beneficiary submission failed');
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async () => {
    if (!beneficiary || saving || readOnly) return;
    if (!window.confirm('Archive this beneficiary? The employee will not be payout-ready until you resubmit.')) return;
    setSaving(true);
    try {
      await beneficiaryApi.archive(employeeId);
      const refreshed = await beneficiaryApi.getForEmployee(employeeId);
      setBeneficiary(refreshed);
      toast.success('Beneficiary archived');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setSaving(false);
    }
  };

  const statusChip = beneficiary && (
    beneficiary.status === 'active' ? (
      <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Active · {beneficiary.beneficiaryId}
      </Badge>
    ) : beneficiary.status === 'failed' ? (
      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
        <AlertCircle className="h-3 w-3 mr-1" /> Failed
      </Badge>
    ) : beneficiary.status === 'archived' ? (
      <Badge variant="outline" className="border-gray-300 text-gray-600 bg-gray-50">
        <Archive className="h-3 w-3 mr-1" /> Archived
      </Badge>
    ) : (
      <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Pending
      </Badge>
    )
  );

  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Wallet className="h-4 w-4 text-blue-600" />
          PayWay Beneficiary
        </h3>
        {statusChip}
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <>
          {beneficiary?.status === 'failed' && beneficiary.rawResponse && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 leading-snug">
              {beneficiary.rawResponse}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Full name *</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Name on the account"
                maxLength={255}
                disabled={saving || readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Bank / wallet *</Label>
              <Select value={bank} onValueChange={setBank} disabled={saving || readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {beneficiaryApi.BANK_OPTIONS.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Account number *</Label>
              <Input
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder="e.g. 001234567"
                inputMode="numeric"
                maxLength={64}
                disabled={saving || readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Phone</Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+855…"
                inputMode="tel"
                maxLength={32}
                disabled={saving || readOnly}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-gray-500">
              Submits to PayWay's Add Beneficiary API.
              {' '}One-time per employee — re-submit only if the account changes.
            </p>
            <div className="flex items-center gap-2">
              {beneficiary?.status === 'active' && (
                <Button variant="outline" size="sm" onClick={onArchive} disabled={saving || readOnly}>
                  <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                </Button>
              )}
              <Button onClick={submit} disabled={saving || readOnly} size="sm">
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <Wallet className="h-3.5 w-3.5 mr-1" />}
                {beneficiary ? 'Resubmit' : 'Submit to PayWay'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
