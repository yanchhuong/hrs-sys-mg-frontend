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
import {
  Settings as SettingsIcon, ShieldCheck, Save, Fingerprint, Trash2, Plus,
  CheckCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  enrollCredential,
  listEnrollments,
  revokeCredential,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getPolicyRequireBiometric,
  setPolicyRequireBiometric,
  EnrolledCredential,
} from '../../utils/webauthn';

export function Settings() {
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
        <h1 className="text-3xl font-bold">System Settings</h1>
        <p className="text-gray-500">Configure HRMS system preferences</p>
      </div>

      <Tabs defaultValue="policy" className="space-y-6">
        <TabsList>
          <TabsTrigger value="policy">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Policy
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="security">
              <Fingerprint className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          )}
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

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Company and system preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input defaultValue="My Company Inc." />
              </div>
              <div className="space-y-2">
                <Label>Payroll Frequency</Label>
                <select className="w-full px-3 py-2 border rounded-md">
                  <option>Twice per month (1st-15th, 16th-31st)</option>
                  <option>Once per month</option>
                  <option>Weekly</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && currentUser && (
          <TabsContent value="security" className="space-y-6">
            <SecuritySettings
              userId={currentUser.employeeId}
              userEmail={currentUser.email}
              displayName={currentEmployee?.name || currentUser.email}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security / Biometric settings
// ---------------------------------------------------------------------------
interface SecuritySettingsProps {
  userId: string;
  userEmail: string;
  displayName: string;
}

function SecuritySettings({ userId, userEmail, displayName }: SecuritySettingsProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
  const [enrollments, setEnrollments] = useState<EnrolledCredential[]>(() => listEnrollments(userId));
  const [requireBiometric, setRequireBiometric] = useState(() => getPolicyRequireBiometric(userId));

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<EnrolledCredential | null>(null);

  useEffect(() => {
    setSupported(isWebAuthnSupported());
    isPlatformAuthenticatorAvailable().then(setPlatformAvailable);
  }, []);

  const refresh = () => setEnrollments(listEnrollments(userId));

  const handleOpenEnroll = () => {
    setDeviceLabel(guessDeviceLabel());
    setEnrollError(null);
    setEnrollOpen(true);
  };

  const handleEnroll = async () => {
    if (!deviceLabel.trim()) {
      setEnrollError('Give this device a name');
      return;
    }
    setEnrolling(true);
    setEnrollError(null);
    try {
      await enrollCredential({
        userId,
        userName: userEmail,
        displayName,
        deviceLabel: deviceLabel.trim(),
      });
      toast.success('Device enrolled');
      refresh();
      setEnrollOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed';
      setEnrollError(msg);
    } finally {
      setEnrolling(false);
    }
  };

  const handleRevoke = () => {
    if (!revokeTarget) return;
    revokeCredential(userId, revokeTarget.id);
    toast.success(`Revoked ${revokeTarget.deviceLabel}`);
    setRevokeTarget(null);
    refresh();
    // If no enrollments left, disable policy automatically
    if (listEnrollments(userId).length === 0 && requireBiometric) {
      setPolicyRequireBiometric(userId, false);
      setRequireBiometric(false);
    }
  };

  const handleTogglePolicy = (checked: boolean) => {
    if (checked && enrollments.length === 0) {
      toast.error('Enroll at least one device before enabling this policy');
      return;
    }
    setPolicyRequireBiometric(userId, checked);
    setRequireBiometric(checked);
    toast.success(checked ? 'Biometric step-up enabled' : 'Biometric step-up disabled');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Biometric Authentication
          </CardTitle>
          <CardDescription>
            Enroll this device's fingerprint, Face ID, or Windows Hello to step up authentication for sensitive admin actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Browser capability banner */}
          {supported === false ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                This browser does not support WebAuthn. Use a recent version of Chrome, Edge, Safari, or Firefox.
              </div>
            </div>
          ) : platformAvailable === false ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                No built-in biometric authenticator detected on this device. You can still enroll an external security key (USB/NFC).
              </div>
            </div>
          ) : platformAvailable === true ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-green-50 border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                Platform authenticator detected (Touch ID, Face ID, Windows Hello, or equivalent).
              </div>
            </div>
          ) : null}

          {/* Policy toggle */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-md border">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Require biometric for sensitive actions</p>
              <p className="text-xs text-gray-500">
                Confirm payroll uploads, role changes, and deletes with a biometric prompt.
              </p>
            </div>
            <Switch
              checked={requireBiometric}
              onCheckedChange={handleTogglePolicy}
              disabled={supported === false}
            />
          </div>

          {/* Enrolled devices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Enrolled Devices ({enrollments.length})</h3>
              <Button
                size="sm"
                onClick={handleOpenEnroll}
                disabled={supported === false}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Enroll this device
              </Button>
            </div>

            {enrollments.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-md">
                <Fingerprint className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No devices enrolled yet.</p>
                <p className="text-xs text-gray-400 mt-1">Enroll this device to start using biometric verification.</p>
              </div>
            ) : (
              <ul className="divide-y border rounded-md">
                {enrollments.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <Fingerprint className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{e.deviceLabel}</p>
                      <p className="text-xs text-gray-500">
                        Enrolled {format(new Date(e.createdAt), 'MMM dd, yyyy')}
                        {e.lastUsedAt && ` · Last used ${format(new Date(e.lastUsedAt), 'MMM dd, HH:mm')}`}
                        {e.transports && e.transports.length > 0 && ` · ${e.transports.join(', ')}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setRevokeTarget(e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Credentials are bound to this origin ({typeof window !== 'undefined' ? window.location.hostname : ''}) and stored locally.
            In production, attestation and assertion verification must happen server-side.
          </p>
        </CardContent>
      </Card>

      {/* Enroll dialog */}
      <Dialog open={enrollOpen} onOpenChange={(o) => !enrolling && setEnrollOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Enroll this device
            </DialogTitle>
            <DialogDescription>
              Give this authenticator a name you'll recognize, then approve the prompt from your device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="device-label">Device name</Label>
              <Input
                id="device-label"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="e.g. Work laptop (Windows Hello)"
                disabled={enrolling}
              />
            </div>
            {enrollError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{enrollError}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEnrollOpen(false)} disabled={enrolling}>
              Cancel
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              <Fingerprint className="h-4 w-4 mr-2" />
              {enrolling ? 'Waiting for device…' : 'Enroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this authenticator?</AlertDialogTitle>
            <AlertDialogDescription>
              "{revokeTarget?.deviceLabel}" will no longer be able to confirm biometric actions.
              You can re-enroll it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-red-600 hover:bg-red-700">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function guessDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows (Windows Hello)';
  if (/Mac OS X/i.test(ua)) return 'Mac (Touch ID)';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android device';
  return 'This device';
}