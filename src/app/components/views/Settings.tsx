import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { mockAttendanceRules } from '../../data/settingsData';
import { Settings as SettingsIcon, ShieldCheck, Save } from 'lucide-react';
import { toast } from 'sonner';

export function Settings() {
  const [rules, setRules] = useState(mockAttendanceRules);
  const [activeRule, setActiveRule] = useState(rules[0]);

  const handleSaveRule = () => {
    toast.success('Attendance rules saved successfully');
  };

  const handleToggleMode = (mode: 'auto' | 'manual') => {
    setActiveRule({ ...activeRule, otCalculationMode: mode });
  };

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
      </Tabs>
    </div>
  );
}