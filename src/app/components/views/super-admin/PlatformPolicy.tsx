import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  KeyRound, Timer, Shield, Flag, Globe, Save, RefreshCw, Plus, Trash2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  defaultPlatformPolicy, PlatformPolicy as Policy,
} from '../../../data/platformData';

const POLICY_KEY = 'hrms:platformPolicy';

function loadPolicy(): Policy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return defaultPlatformPolicy;
    return { ...defaultPlatformPolicy, ...(JSON.parse(raw) as Partial<Policy>) };
  } catch {
    return defaultPlatformPolicy;
  }
}

export function PlatformPolicy() {
  const [policy, setPolicy] = useState<Policy>(() => loadPolicy());
  const [dirty, setDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newIp, setNewIp] = useState('');

  const patch = (p: Partial<Policy>) => { setPolicy({ ...policy, ...p }); setDirty(true); };

  const handleSave = () => {
    localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
    setDirty(false);
    toast.success('Platform policy saved — applied to all tenants');
  };

  const handleReset = () => {
    setPolicy(defaultPlatformPolicy);
    localStorage.removeItem(POLICY_KEY);
    setDirty(false);
    setResetOpen(false);
    toast.success('Reset to default policy');
  };

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="font-medium text-sm">Global platform policy</p>
              <p className="text-xs text-gray-500">
                These rules are the <strong>ceiling</strong>. Tenant admins can tighten them further but cannot loosen.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge className="bg-amber-100 text-amber-900">Unsaved changes</Badge>}
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Defaults
            </Button>
            <Button onClick={handleSave} disabled={!dirty}>
              <Save className="h-4 w-4 mr-2" />
              Save Policy
            </Button>
          </div>
        </CardContent>
      </Card>

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
              <CardDescription>Minimum strength requirements for every tenant.</CardDescription>
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
              <CardDescription>Token lifetime and how often local installs can sync.</CardDescription>
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
              <CardDescription>Optional IP allowlist applied to all tenants.</CardDescription>
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
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => patch({ ipAllowlist: policy.ipAllowlist.filter((_, i) => i !== idx) })}
                          disabled={!policy.ipAllowlistEnabled}
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
              <CardDescription>Globally enable or disable platform capabilities.</CardDescription>
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

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to default policy?</AlertDialogTitle>
            <AlertDialogDescription>
              All customizations are discarded. Tenant admins keep their local tightening — only the platform ceiling resets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dirty && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-md bg-amber-50 border border-amber-200 shadow-md">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <span className="text-sm text-amber-900">Unsaved changes</span>
          <Button size="sm" onClick={handleSave}>Save now</Button>
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

function NumberField({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-md border">
      <div className="space-y-0.5 flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
