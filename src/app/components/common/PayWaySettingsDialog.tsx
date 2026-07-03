import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Copy, KeyRound, RefreshCw, Save, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import * as payway from '../../api/payway';
import { useConfirm } from '../../context/ConfirmContext';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional change hook so the parent can refresh any cached
   *  "PayWay enabled" flag after a save. */
  onSaved?: (next: payway.PayWayCredentials) => void;
}

/**
 * Per-tenant PayWay (ABA) credentials dialog (V144). One row per
 * tenant; lazy-created on first save. The API key field is
 * write-only — the GET returns just a masked preview so a snooping
 * operator can confirm what's stored without seeing the secret.
 *
 * <p>Push URL: server-composed (configured public host + per-tenant
 * token); operator clicks Copy and pastes into the PayWay dashboard.
 * The Rotate button cycles the token — useful when the URL has been
 * shared and the operator wants to invalidate the old one.</p>
 */
export function PayWaySettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [data, setData] = useState<payway.PayWayCredentials | null>(null);
  const [form, setForm] = useState<payway.PayWayCredentialsRequest>({
    enabled: false,
    environment: 'sandbox',
    merchantId: '',
    apiKey: '',
  });

  // Re-fetch on every open so a settings change made elsewhere
  // (e.g. another admin tab) is reflected immediately.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    payway.getCredentials()
      .then(d => {
        setData(d);
        setForm({
          enabled: d.enabled,
          environment: d.environment,
          merchantId: d.merchantId,
          apiKey: '',                // never pre-fill; preview shows current
        });
      })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load PayWay settings'))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    if (!form.merchantId.trim()) {
      toast.error('Merchant ID is required');
      return;
    }
    if (!data?.configured && !form.apiKey?.trim()) {
      toast.error('API key is required on first save');
      return;
    }
    setSaving(true);
    try {
      const next = await payway.saveCredentials({
        enabled: form.enabled,
        environment: form.environment,
        merchantId: form.merchantId.trim(),
        // Empty = leave the stored key untouched. The BE
        // distinguishes blank vs null on the request payload.
        apiKey: form.apiKey?.trim() || undefined,
      });
      setData(next);
      setForm(f => ({ ...f, apiKey: '' }));
      onSaved?.(next);
      toast.success('PayWay settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    if (!(await confirm({
      title: 'Rotate the push URL?',
      message: 'The old URL will stop working — update the PayWay dashboard right after.',
      variant: 'destructive',
      confirmLabel: 'Rotate',
    }))) return;
    setRotating(true);
    try {
      const next = await payway.rotatePushToken();
      setData(next);
      toast.success('Push URL rotated — update your PayWay dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rotate token');
    } finally {
      setRotating(false);
    }
  };

  const copyPushUrl = async () => {
    if (!data?.pushUrl) return;
    try {
      await navigator.clipboard.writeText(data.pushUrl);
      toast.success('Push URL copied');
    } catch {
      toast.error('Copy failed — select the text manually');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-blue-600" />
            PayWay (ABA) Integration
          </DialogTitle>
          <DialogDescription className="text-xs">
            Per-tenant credentials for real-time payment processing on POS + Invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Enabled toggle */}
          <div className="flex items-start justify-between gap-4 border-b pb-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-gray-500 leading-snug">
                Off = the PayWay payment method is hidden on POS / Invoice. Turn on
                after the credentials below are saved + verified.
              </div>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
              disabled={loading || saving}
            />
          </div>

          {/* Environment */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Environment</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['sandbox', 'live'] as const).map(env => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, environment: env }))}
                  className={`rounded-md border px-3 py-2 text-sm capitalize transition ${
                    form.environment === env
                      ? env === 'live'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  disabled={loading || saving}
                >
                  {env}
                  {env === 'live' && <span className="ml-1 text-[10px] text-emerald-600">production</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Merchant ID */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Merchant ID</Label>
            <Input
              value={form.merchantId}
              onChange={e => setForm(f => ({ ...f, merchantId: e.target.value }))}
              placeholder="From your PayWay dashboard"
              disabled={loading || saving}
              maxLength={64}
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              API Key
              {data?.configured && data.apiKeyPreview && (
                <span className="text-[11px] text-gray-500">
                  Stored: <code className="tabular-nums">{data.apiKeyPreview}</code>
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey ?? ''}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={data?.configured ? 'Leave blank to keep the saved key' : 'Paste API key from PayWay dashboard'}
                disabled={loading || saving}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Encrypted with AES-GCM before saving — never logged, never returned to the browser.
            </p>
          </div>

          {/* Push URL (read-only + copy) */}
          {data?.configured && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs text-gray-600">Push URL (paste into PayWay dashboard)</Label>
              <div className="flex gap-1.5">
                <Input
                  value={data.pushUrl}
                  readOnly
                  className="tabular-nums text-[11px] h-8 bg-gray-50"
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={copyPushUrl}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8"
                  onClick={handleRotate} disabled={rotating}>
                  <RefreshCw className={`h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">
                PayWay calls this URL when a payment completes. Rotate to invalidate the
                old URL if it's ever exposed.
              </p>
            </div>
          )}

          {/* Warning banner — production = real money */}
          {form.environment === 'live' && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 inline-flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Live environment moves real funds. Confirm the merchant ID + API key
                were tested in sandbox first.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-white shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
