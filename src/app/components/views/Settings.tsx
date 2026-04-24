import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { mockAttendanceRules } from '../../data/settingsData';
import { Badge } from '../ui/badge';
import {
  Settings as SettingsIcon, ShieldCheck, Save, Fingerprint, Plus,
  CheckCircle, AlertTriangle, Cloud, CloudOff, Link2, Link2Off,
  RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  loadCloudConfig, saveCloudConfig, clearCloudConfig, deriveStatus,
  testCloudConnection, runSyncNow, CloudConfig, ConnectionStatus, TestResult,
} from '../../utils/cloudSync';
import { useI18n } from '../../i18n/I18nContext';
import { DevicesCard } from '../common/DevicesCard';

export function Settings() {
  const { t } = useI18n();
  const { currentUser, currentEmployee } = useAuth();
  const [rules, setRules] = useState(mockAttendanceRules);
  const [activeRule, setActiveRule] = useState(rules[0]);

  const handleSaveRule = () => {
    toast.success('Attendance rules saved successfully');
  };

  const handleToggleMode = (mode: 'auto' | 'manual') => {
    setActiveRule({ ...activeRule, otCalculationMode: mode });
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.settings.title')}</h1>
        <p className="text-gray-500">{t('page.settings.description')}</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Company
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="security">
              <Fingerprint className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          )}
          <TabsTrigger value="policy">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Policy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Policy</CardTitle>
              <CardDescription>
                Configure standard working hours and overtime calculation mode
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="checkIn">Standard Check-In Time</Label>
                  <Input
                    id="checkIn"
                    type="time"
                    value={activeRule.standardCheckIn}
                    onChange={(e) =>
                      setActiveRule({ ...activeRule, standardCheckIn: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkOut">Standard Check-Out Time</Label>
                  <Input
                    id="checkOut"
                    type="time"
                    value={activeRule.standardCheckOut}
                    onChange={(e) =>
                      setActiveRule({ ...activeRule, standardCheckOut: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lateThreshold">Late Threshold (Minutes)</Label>
                <Input
                  id="lateThreshold"
                  type="number"
                  value={activeRule.lateThresholdMinutes}
                  onChange={(e) =>
                    setActiveRule({
                      ...activeRule,
                      lateThresholdMinutes: parseInt(e.target.value),
                    })
                  }
                />
                <p className="text-sm text-gray-500">
                  Check-in after {activeRule.lateThresholdMinutes} minutes will be marked as late
                </p>
              </div>

              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <Label className="text-base font-semibold">Overtime Calculation Mode</Label>

                <div className="space-y-3">
                  <div
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-all ${
                      activeRule.otCalculationMode === 'auto'
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleToggleMode('auto')}
                  >
                    <div className="flex-1">
                      <p className="font-medium">Factory Mode (Automatic)</p>
                      <p className="text-sm text-gray-600">
                        Auto-calculate OT based on late check-out. No approval needed.
                      </p>
                    </div>
                    <Switch
                      checked={activeRule.otCalculationMode === 'auto'}
                      onCheckedChange={() => handleToggleMode('auto')}
                    />
                  </div>

                  <div
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-all ${
                      activeRule.otCalculationMode === 'manual'
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleToggleMode('manual')}
                  >
                    <div className="flex-1">
                      <p className="font-medium">Office Mode (Manual Approval)</p>
                      <p className="text-sm text-gray-600">
                        Employees request OT and managers approve manually.
                      </p>
                    </div>
                    <Switch
                      checked={activeRule.otCalculationMode === 'manual'}
                      onCheckedChange={() => handleToggleMode('manual')}
                    />
                  </div>
                </div>

                {activeRule.otCalculationMode === 'auto' && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Factory Mode Active:</strong> Any check-out time after{' '}
                      {activeRule.standardCheckOut} will automatically count as overtime hours.
                      Upload Excel files to batch import attendance records.
                    </p>
                  </div>
                )}
              </div>

              <Button onClick={handleSaveRule} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                Save Policy
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Example Calculations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Employee checks out at 19:00</span>
                    <span className="text-sm text-green-600 font-semibold">+2h OT</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Standard: {activeRule.standardCheckOut} → Actual: 19:00 = 2 hours overtime
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Employee checks in at 08:20</span>
                    <span className="text-sm text-yellow-600 font-semibold">Late</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    20 minutes after {activeRule.standardCheckIn} (Threshold:{' '}
                    {activeRule.lateThresholdMinutes}m)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <CompanyInformationCard />
          {isAdmin && <CloudConnectionCard />}
        </TabsContent>

        {isAdmin && currentUser && (
          <TabsContent value="security" className="space-y-6">
            <DevicesCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Company Information
// ---------------------------------------------------------------------------
interface CompanyInfo {
  name: string;
  contact: string;
  email: string;
  tin: string;
  plan: 'free' | 'starter' | 'business' | 'enterprise';
  address: string;
}

const COMPANY_INFO_KEY = 'hrms:companyInfo';
const defaultCompanyInfo: CompanyInfo = {
  name: 'My Company Inc.',
  contact: '+855-23-000-0000',
  email: 'hr@company.com',
  tin: '',
  plan: 'business',
  address: '',
};

function loadCompanyInfo(): CompanyInfo {
  try {
    const raw = localStorage.getItem(COMPANY_INFO_KEY);
    return raw ? { ...defaultCompanyInfo, ...(JSON.parse(raw) as Partial<CompanyInfo>) } : defaultCompanyInfo;
  } catch {
    return defaultCompanyInfo;
  }
}

function CompanyInformationCard() {
  const [info, setInfo] = useState<CompanyInfo>(() => loadCompanyInfo());
  const [dirty, setDirty] = useState(false);

  const patch = (p: Partial<CompanyInfo>) => { setInfo({ ...info, ...p }); setDirty(true); };

  const handleSave = () => {
    if (!info.name.trim()) { toast.error('Company name is required'); return; }
    if (info.email && !/^\S+@\S+\.\S+$/.test(info.email)) { toast.error('Invalid email'); return; }
    localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(info));
    setDirty(false);
    toast.success('Company information saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Information</CardTitle>
        <CardDescription>Public business details shown on payslips, tax reports, and invoices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ci-name">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="ci-name"
              value={info.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="My Company Inc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-contact">Contact</Label>
            <Input
              id="ci-contact"
              value={info.contact}
              onChange={(e) => patch({ contact: e.target.value })}
              placeholder="+855-23-000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-email">Email</Label>
            <Input
              id="ci-email"
              type="email"
              value={info.email}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="hr@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-tin">TIN</Label>
            <Input
              id="ci-tin"
              value={info.tin}
              onChange={(e) => patch({ tin: e.target.value })}
              placeholder="Taxpayer Identification Number"
            />
            <p className="text-xs text-gray-500">Printed on tax reports (TOS, annual summary).</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ci-plan">Plan</Label>
            <select
              id="ci-plan"
              value={info.plan}
              onChange={(e) => patch({ plan: e.target.value as CompanyInfo['plan'] })}
              className="w-full px-3 py-2 border rounded-md h-9"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <p className="text-xs text-gray-500">Managed by the platform admin; read-only for tenant admins in production.</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ci-address">Address</Label>
            <Input
              id="ci-address"
              value={info.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="Street, District, City, Country"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {dirty && <span className="text-xs text-amber-700 mr-auto">Unsaved changes</span>}
          <Button variant="outline" onClick={() => { setInfo(loadCompanyInfo()); setDirty(false); }} disabled={!dirty}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!dirty}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cloud Connection
// ---------------------------------------------------------------------------
function CloudConnectionCard() {
  const [cfg, setCfg] = useState<CloudConfig>(() => loadCloudConfig());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<TestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const status: ConnectionStatus = deriveStatus(cfg);
  const configured = !!(cfg.serverUrl && cfg.apiKey);

  const patch = (p: Partial<CloudConfig>) => setCfg({ ...cfg, ...p });

  const handleTest = async () => {
    if (!cfg.serverUrl || !cfg.apiKey) {
      toast.error('Enter server URL and API key first');
      return;
    }
    setTesting(true);
    setLastTest(null);
    const res = await testCloudConnection(cfg.serverUrl, cfg.apiKey);
    setTesting(false);
    setLastTest(res);
    if (res.ok) {
      toast.success(`Reachable — ${res.mode ?? 'unknown'} mode, ${res.latencyMs}ms`);
    } else {
      toast.error(`Test failed: ${res.error}`);
    }
  };

  const handleConnect = async () => {
    if (!cfg.serverUrl || !cfg.apiKey) {
      toast.error('Enter server URL and API key first');
      return;
    }
    setTesting(true);
    const res = await testCloudConnection(cfg.serverUrl, cfg.apiKey);
    setTesting(false);
    setLastTest(res);
    if (!res.ok) {
      toast.error(`Cannot connect: ${res.error}`);
      return;
    }
    const next = saveCloudConfig({
      ...cfg,
      connectedAt: new Date().toISOString(),
      lastSyncStatus: 'ok',
      lastSyncError: undefined,
    });
    setCfg(next);
    toast.success('Connected to cloud');
  };

  const handleDisconnect = () => {
    clearCloudConfig();
    setCfg({ ...cfg, apiKey: '', connectedAt: undefined, lastSyncAt: undefined, lastSyncStatus: undefined, lastSyncError: undefined });
    setLastTest(null);
    setDisconnectOpen(false);
    toast.success('Disconnected. API key cleared from this device.');
  };

  const handleSaveSettings = () => {
    const next = saveCloudConfig(cfg);
    setCfg(next);
    toast.success('Cloud settings saved');
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    const res = await runSyncNow();
    setSyncing(false);
    setCfg(loadCloudConfig());
    if (res.ok) toast.success(`Sync OK — ${res.latencyMs}ms`);
    else toast.error(`Sync failed: ${res.error}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Cloud Connection
            </CardTitle>
            <CardDescription>
              Pair this local install with the online HRMS. Data syncs via the tenant API key.
            </CardDescription>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="cloud-url">
              Server URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cloud-url"
              type="url"
              placeholder="https://hrms.example.com"
              value={cfg.serverUrl}
              onChange={(e) => patch({ serverUrl: e.target.value })}
            />
            <p className="text-xs text-gray-500">
              The cloud HRMS origin. Must include <code>https://</code> in production.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="cloud-key">
              Tenant API Key <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="cloud-key"
                type={showKey ? 'text' : 'password'}
                placeholder="Paste the key from your platform admin"
                value={cfg.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Never commit this key. Use your cloud admin console to rotate if it leaks.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-slug">Tenant Slug (optional)</Label>
            <Input
              id="tenant-slug"
              placeholder="acme"
              value={cfg.tenantSlug ?? ''}
              onChange={(e) => patch({ tenantSlug: e.target.value })}
            />
            <p className="text-xs text-gray-500">Label used by the cloud to identify this site.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sync-interval">Sync Interval (seconds)</Label>
            <Input
              id="sync-interval"
              type="number"
              min={30}
              max={3600}
              value={cfg.syncIntervalSeconds}
              onChange={(e) => patch({ syncIntervalSeconds: Math.max(30, parseInt(e.target.value || '300', 10)) })}
            />
          </div>

          <div className="md:col-span-2 flex items-start justify-between gap-4 p-3 rounded-md border">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Automatic sync</p>
              <p className="text-xs text-gray-500">
                Backend worker pushes local changes and pulls remote changes on the interval above.
              </p>
            </div>
            <Switch
              checked={cfg.autoSync}
              onCheckedChange={(v) => patch({ autoSync: v })}
              disabled={status !== 'connected'}
            />
          </div>
        </div>

        {/* Live test result */}
        {lastTest && (
          <div
            className={`flex items-start gap-3 p-3 rounded-md border ${
              lastTest.ok
                ? 'bg-green-50 border-green-200 text-green-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {lastTest.ok ? (
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="text-sm flex-1 min-w-0">
              {lastTest.ok ? (
                <>
                  <p className="font-medium">Cloud is reachable</p>
                  <p className="text-xs mt-0.5">
                    Mode: <strong>{lastTest.mode ?? 'unknown'}</strong>
                    {' · '}Latency: {lastTest.latencyMs}ms
                    {lastTest.serverTime && ` · Server time: ${lastTest.serverTime}`}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Connection check failed</p>
                  <p className="text-xs mt-0.5">{lastTest.error}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Last sync summary when connected */}
        {status === 'connected' && cfg.lastSyncAt && (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Last sync {formatDistanceToNow(new Date(cfg.lastSyncAt), { addSuffix: true })}
            {cfg.lastSyncStatus === 'error' && cfg.lastSyncError && (
              <span className="text-red-700">— {cfg.lastSyncError}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 flex-wrap pt-2 border-t">
          {status === 'connected' && (
            <>
              <Button variant="outline" onClick={handleSyncNow} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync Now'}
              </Button>
              <Button variant="outline" onClick={handleSaveSettings}>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => setDisconnectOpen(true)}
                className="text-red-700 border-red-200 hover:bg-red-50"
              >
                <Link2Off className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </>
          )}

          {status !== 'connected' && (
            <>
              <Button variant="outline" onClick={handleTest} disabled={!configured || testing}>
                {testing ? 'Testing…' : 'Test Connection'}
              </Button>
              <Button onClick={handleConnect} disabled={!configured || testing}>
                <Link2 className="h-4 w-4 mr-2" />
                Connect
              </Button>
            </>
          )}
        </div>

        {status === 'not_configured' && (
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <CloudOff className="h-3.5 w-3.5" />
            Enter the cloud server URL and your tenant API key, then Connect.
          </p>
        )}
      </CardContent>

      {/* Disconnect confirmation */}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect from cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              The tenant API key will be removed from this device and automatic sync will stop.
              Local data is kept. You can reconnect later with the same key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-red-600 hover:bg-red-700">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { label: string; cls: string; Icon: typeof Cloud }> = {
    not_configured: { label: 'Not configured', cls: 'bg-gray-100 text-gray-700 border-gray-200', Icon: CloudOff },
    disconnected:   { label: 'Disconnected',   cls: 'bg-gray-100 text-gray-700 border-gray-200', Icon: CloudOff },
    testing:        { label: 'Testing',        cls: 'bg-blue-50 text-blue-800 border-blue-200',  Icon: RefreshCw },
    connected:      { label: 'Connected',      cls: 'bg-green-50 text-green-800 border-green-200', Icon: Cloud },
    error:          { label: 'Error',          cls: 'bg-red-50 text-red-800 border-red-200',    Icon: AlertTriangle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}