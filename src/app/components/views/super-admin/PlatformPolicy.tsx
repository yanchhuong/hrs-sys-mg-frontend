import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  KeyRound, Timer, Flag, Globe, Save, RefreshCw, Plus, Trash2, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  defaultPlatformPolicy, PlatformPolicy as Policy,
} from '../../../data/platformData';
import { NumericInput } from '../../common/NumericInput';
import { ListError } from '../../common/ListStates';
import { useConfirm } from '../../../context/ConfirmContext';
import { TONE_CLASS } from '../../../utils/statusTones';
import { USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';

// Mock mode keeps the whole policy in this browser. In live mode the policy
// lives in the platform_policy row (GET/PUT /api/v1/platform/policy); only the
// IP allowlist entries stay in localStorage because the server has no column
// for them yet (it stores just the ipAllowlistEnabled flag).
const POLICY_KEY = 'hrms:platformPolicy';
const IP_LIST_KEY = 'hrms:platformPolicy:ipAllowlist';

function loadLocalPolicy(): Policy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return defaultPlatformPolicy;
    return { ...defaultPlatformPolicy, ...(JSON.parse(raw) as Partial<Policy>) };
  } catch {
    return defaultPlatformPolicy;
  }
}

function loadLocalIpList(): string[] {
  try {
    const raw = localStorage.getItem(IP_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveLocalIpList(list: string[]) {
  try { localStorage.setItem(IP_LIST_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

/** Server row → page shape. Unknown / non-boolean flags are dropped; missing
 *  known flags fall back to the defaults so every toggle still renders. */
function fromServer(p: platformApi.PlatformPolicy): Policy {
  const flags: Record<string, boolean> = { ...defaultPlatformPolicy.featureFlags };
  for (const [k, v] of Object.entries(p.featureFlags ?? {})) {
    if (typeof v === 'boolean') flags[k] = v;
  }
  return {
    passwordMinLength: p.passwordMinLength,
    passwordRequireNumber: p.passwordRequireNumber,
    passwordRequireSymbol: p.passwordRequireSymbol,
    passwordRequireUppercase: p.passwordRequireUppercase,
    passwordExpiryDays: p.passwordExpiryDays,
    mfaRequired: p.mfaRequired,
    sessionTimeoutMinutes: p.sessionTimeoutMinutes,
    minSyncIntervalSeconds: p.minSyncIntervalSeconds,
    dataRetentionDays: p.dataRetentionDays,
    auditLogRetentionDays: p.auditLogRetentionDays,
    ipAllowlistEnabled: p.ipAllowlistEnabled,
    ipAllowlist: loadLocalIpList(),
    featureFlags: flags,
  };
}

function toServer(p: Policy) {
  return {
    passwordMinLength: p.passwordMinLength,
    passwordRequireNumber: p.passwordRequireNumber,
    passwordRequireSymbol: p.passwordRequireSymbol,
    passwordRequireUppercase: p.passwordRequireUppercase,
    passwordExpiryDays: p.passwordExpiryDays,
    mfaRequired: p.mfaRequired,
    sessionTimeoutMinutes: p.sessionTimeoutMinutes,
    minSyncIntervalSeconds: p.minSyncIntervalSeconds,
    dataRetentionDays: p.dataRetentionDays,
    auditLogRetentionDays: p.auditLogRetentionDays,
    ipAllowlistEnabled: p.ipAllowlistEnabled,
    featureFlags: p.featureFlags,
  };
}

export function PlatformPolicy() {
  const confirm = useConfirm();
  const [policy, setPolicy] = useState<Policy>(() => (USE_MOCKS ? loadLocalPolicy() : defaultPlatformPolicy));
  const [dirty, setDirty] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [loading, setLoading] = useState(!USE_MOCKS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (USE_MOCKS) return;
    setLoading(true);
    try {
      const p = await platformApi.policy.get();
      setPolicy(fromServer(p));
      setDirty(false);
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the platform policy.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<Policy>) => { setPolicy({ ...policy, ...p }); setDirty(true); };

  const persist = async (next: Policy): Promise<boolean> => {
    if (USE_MOCKS) {
      try {
        localStorage.setItem(POLICY_KEY, JSON.stringify(next));
        return true;
      } catch {
        toast.error('Could not save the policy in this browser');
        return false;
      }
    }
    setSaving(true);
    try {
      const saved = await platformApi.policy.update(toServer(next));
      saveLocalIpList(next.ipAllowlist);
      setPolicy({ ...fromServer(saved), ipAllowlist: next.ipAllowlist });
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the platform policy');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!(await persist(policy))) return;
    setDirty(false);
    toast.success(USE_MOCKS ? 'Platform policy saved in this browser (demo mode)' : 'Platform policy saved');
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset to default policy?',
      message: 'All customizations are discarded and the defaults are saved immediately. Tenant admins keep their local tightening — only the platform ceiling resets.',
      confirmLabel: 'Reset',
      variant: 'destructive',
    });
    if (!ok) return;
    if (USE_MOCKS) {
      try { localStorage.removeItem(POLICY_KEY); } catch { /* storage blocked */ }
      setPolicy(defaultPlatformPolicy);
      setDirty(false);
      toast.success('Reset to default policy');
      return;
    }
    if (!(await persist(defaultPlatformPolicy))) return;
    setDirty(false);
    toast.success('Reset to default policy');
  };

  const busy = loading || saving;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">
          These rules are the <strong>ceiling</strong>. Tenant admins can tighten them further but cannot loosen.
        </p>
        <div className="flex items-center justify-end gap-2">
          {dirty && <Badge variant="outline" className={TONE_CLASS.attention}>Unsaved changes</Badge>}
          <Button variant="outline" onClick={handleReset} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Defaults
          </Button>
          <Button onClick={handleSave} disabled={!dirty || busy}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving…' : 'Save Policy'}
          </Button>
        </div>
      </div>

      {USE_MOCKS && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
          <p>Demo mode: this policy is saved in this browser only and is not applied to any tenant.</p>
        </div>
      )}

      {loadError && (
        <Card>
          <CardContent className="p-0">
            <ListError message={loadError} onRetry={() => { void load(); }} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="password" className="space-y-6">
        <TabsList>
          <TabsTrigger value="password"><KeyRound className="h-4 w-4 mr-2" />Password</TabsTrigger>
          <TabsTrigger value="session"><Timer className="h-4 w-4 mr-2" />Session &amp; Sync</TabsTrigger>
          <TabsTrigger value="access"><Globe className="h-4 w-4 mr-2" />Access Control</TabsTrigger>
          <TabsTrigger value="features"><Flag className="h-4 w-4 mr-2" />Features</TabsTrigger>
        </TabsList>

        {/* Password tab */}
        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Password Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label="Minimum length"
                  value={policy.passwordMinLength}
                  min={8} max={64}
                  onChange={(v) => patch({ passwordMinLength: v })}
                  hint="Cannot be reduced below 8."
                />
                <NumberField
                  label="Password expiry (days)"
                  value={policy.passwordExpiryDays}
                  min={0} max={365}
                  onChange={(v) => patch({ passwordExpiryDays: v })}
                  hint="0 = never expires."
                />
              </div>
              <ToggleRow
                label="Require at least one number"
                value={policy.passwordRequireNumber}
                onChange={(v) => patch({ passwordRequireNumber: v })}
              />
              <ToggleRow
                label="Require at least one symbol"
                value={policy.passwordRequireSymbol}
                onChange={(v) => patch({ passwordRequireSymbol: v })}
              />
              <ToggleRow
                label="Require at least one uppercase letter"
                value={policy.passwordRequireUppercase}
                onChange={(v) => patch({ passwordRequireUppercase: v })}
              />
              <ToggleRow
                label="Require MFA"
                value={policy.mfaRequired}
                onChange={(v) => patch({ mfaRequired: v })}
                description="All users must enrol a second factor before first login."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session tab */}
        <TabsContent value="session">
          <Card>
            <CardHeader>
              <CardTitle>Session &amp; Sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label="Session timeout (minutes)"
                  value={policy.sessionTimeoutMinutes}
                  min={15} max={1440}
                  onChange={(v) => patch({ sessionTimeoutMinutes: v })}
                  hint="Idle time before re-authentication."
                />
                <NumberField
                  label="Min sync interval (seconds)"
                  value={policy.minSyncIntervalSeconds}
                  min={30} max={3600}
                  onChange={(v) => patch({ minSyncIntervalSeconds: v })}
                  hint="Local installs cannot sync more frequently than this."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label="Data retention (days)"
                  value={policy.dataRetentionDays}
                  min={90} max={3650}
                  onChange={(v) => patch({ dataRetentionDays: v })}
                  hint="Archived records older than this are purged."
                />
                <NumberField
                  label="Audit log retention (days)"
                  value={policy.auditLogRetentionDays}
                  min={30} max={3650}
                  onChange={(v) => patch({ auditLogRetentionDays: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access tab */}
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Access Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow
                label="Enforce IP allowlist"
                value={policy.ipAllowlistEnabled}
                onChange={(v) => patch({ ipAllowlistEnabled: v })}
                description="When enabled, only requests from the listed IPs / CIDRs are accepted."
              />

              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Allowed IPs / CIDRs</Label>
                {!USE_MOCKS && (
                  <p className="text-xs text-amber-700">
                    The address list below is kept in this browser only — the server does not store platform-wide IP entries yet.
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="e.g. 203.0.113.0/24"
                    disabled={!policy.ipAllowlistEnabled}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const cleaned = newIp.trim();
                      if (!cleaned) return;
                      patch({ ipAllowlist: [...policy.ipAllowlist, cleaned] });
                      setNewIp('');
                    }}
                    disabled={!policy.ipAllowlistEnabled}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add
                  </Button>
                </div>
                {policy.ipAllowlist.length === 0 ? (
                  <p className="text-xs text-gray-500 pt-1">No addresses configured.</p>
                ) : (
                  <ul className="divide-y border rounded-md">
                    {policy.ipAllowlist.map((ip, idx) => (
                      <li key={idx} className="flex items-center justify-between px-3 py-2">
                        <code className="text-xs">{ip}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:bg-red-50"
                          onClick={() => patch({ ipAllowlist: policy.ipAllowlist.filter((_, i) => i !== idx) })}
                          disabled={!policy.ipAllowlistEnabled}
                          title="Remove"
                          aria-label={`Remove ${ip}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feature flags tab */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(policy.featureFlags).map(([key, on]) => (
                <ToggleRow
                  key={key}
                  label={humanize(key)}
                  value={on}
                  onChange={(v) => patch({ featureFlags: { ...policy.featureFlags, [key]: v } })}
                  description={FEATURE_DESCRIPTIONS[key]}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-md bg-amber-50 border border-amber-200 shadow-md">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <span className="text-sm text-amber-900">Unsaved changes</span>
          <Button size="sm" onClick={handleSave} disabled={busy}>Save now</Button>
        </div>
      )}
    </div>
  );
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  biometricLogin:       'WebAuthn step-up prompts for sensitive actions.',
  customRoles:          'Tenants can define custom roles beyond built-ins.',
  webhookIntegrations:  'Outbound webhooks for HR events (alpha).',
  advancedReports:      'Multi-tenant analytics and scheduled exports.',
  bulkPayrollUpload:    'Admins can upload payroll via Excel template.',
};

/** Integer field: free typing while focused, clamped to [min, max] on blur
 *  (clamping per keystroke made e.g. "120" impossible to type when min=15). */
function NumberField({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; hint?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = parseInt(draft, 10);
    const next = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <NumericInput
        value={draft}
        onChange={(raw) => {
          setDraft(raw);
          // Push in-range values straight away so Save sees them without a blur.
          const v = parseInt(raw, 10);
          if (Number.isFinite(v) && v >= min && v <= max && v !== value) onChange(v);
        }}
        onBlur={commit}
        decimals={0}
        maxInt={5}
        className="text-left"
      />
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-md border">
      <div className="space-y-0.5 flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
