import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { mockAttendanceRules, defaultOTSettings, defaultAttendanceRule } from '../../data/settingsData';
import { mockDepartments } from '../../data/mockData';
import { mockHolidays } from '../../data/timeworkData';
import { AttendanceRule, OTSettings } from '../../types/settings';
import { Holiday } from '../../types/timework';
import {
  Settings, Clock, Save, Coffee, ArrowRightLeft, AlertTriangle, Timer,
  Plus, Trash2, Pencil, CheckCircle2, XCircle, Info, Zap, Building2, CalendarDays,
  Briefcase, Calendar, PartyPopper, Shield, Users,
} from 'lucide-react';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import {
  ScanMode, ScanRule, DEFAULT_SCAN_RULE,
  loadScanRule, saveScanRule,
  evaluate, previewScenarios, EvaluatedSession,
} from '../../utils/scanRule';
import { FlexibleWorkCard } from '../common/FlexibleWorkCard';

export function AttendanceSettings() {
  // Kept for OT-tab cross-references (activeShift) — no per-shift UI anymore;
  // per-employee work schedules are assigned on the Employee record.
  const [shifts] = useState<AttendanceRule[]>(mockAttendanceRules);
  const [otSettings, setOtSettings] = useState<OTSettings>(defaultOTSettings);
  const [scanRule, setScanRule] = useState<ScanRule>(() => loadScanRule());
  const [activeTab, setActiveTab] = useState('scan');
  const [otSubTab, setOtSubTab] = useState('workday');
  const [deptAssignDialogOpen, setDeptAssignDialogOpen] = useState(false);
  const [newDeptAssign, setNewDeptAssign] = useState({ department: '', ruleLabel: '', weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 });

  // Holiday state
  const [holidays, setHolidays] = useState(mockHolidays);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '', type: 'public' as 'public' | 'company', isPaid: true, description: '' });
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });

  // General settings state
  const [generalSettings, setGeneralSettings] = useState({
    autoMarkAbsent: true,
    absentDeadlineTime: '10:00',
    trackMissingPunch: true,
    notifyManager: true,
    notifyEmployee: true,
    weekendDays: ['Saturday', 'Sunday'] as string[],
  });

  const handleSave = () => {
    toast.success('Attendance settings saved successfully');
  };

  const handleAddHoliday = () => {
    if (!newHoliday.name || !newHoliday.date) { toast.error('Please fill in name and date'); return; }
    const holiday: Holiday = { id: `HOL${String(holidays.length + 1).padStart(3, '0')}`, ...newHoliday };
    setHolidays([...holidays, holiday]);
    setNewHoliday({ name: '', date: '', type: 'public', isPaid: true, description: '' });
    setHolidayDialogOpen(false);
    toast.success('Holiday added successfully');
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays(holidays.filter(h => h.id !== id));
    toast.success('Holiday deleted');
  };

  const filteredHolidays = holidays.filter(h => {
    if (!dateFilter.start && !dateFilter.end) return true;
    const holDate = parseISO(h.date);
    if (dateFilter.start && dateFilter.end) return isWithinInterval(holDate, { start: parseISO(dateFilter.start), end: parseISO(dateFilter.end) });
    if (dateFilter.start) return holDate >= parseISO(dateFilter.start);
    if (dateFilter.end) return holDate <= parseISO(dateFilter.end);
    return true;
  });

  const holidaysPagination = usePagination(filteredHolidays, 10);

  useEffect(() => {
    holidaysPagination.resetPage();
  }, [dateFilter]);

  // OT tab uses the currently-active shift as reference for sample calculations.
  const activeShift = shifts.find(s => s.isActive) || shifts[0];

  const addGrace = (time: string, minutes: number) => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Attendance Settings</h1>
          <p className="text-gray-500">Configure check-in/out rules, schedules, and overtime calculation</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save All Settings
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="scan" className="gap-1.5">
            <ArrowRightLeft className="h-4 w-4" />
            Scan Rule
          </TabsTrigger>
          <TabsTrigger value="flexible" className="gap-1.5">
            <Users className="h-4 w-4" />
            Flexible Work
          </TabsTrigger>
          <TabsTrigger value="ot" className="gap-1.5">
            <Timer className="h-4 w-4" />
            OT Rules
          </TabsTrigger>
          <TabsTrigger value="holiday" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Holiday
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ SCAN RULE TAB ═══════════════ */}
        <TabsContent value="scan" className="space-y-6">
          <ScanRuleCard
            rule={scanRule}
            onChange={(next) => setScanRule(next)}
          />
        </TabsContent>

        {/* ═══════════════ FLEXIBLE WORK TAB ═══════════════ */}
        <TabsContent value="flexible" className="space-y-6">
          <FlexibleWorkCard scanRule={scanRule} />
        </TabsContent>


        {/* ═══════════════ OT RULES TAB ═══════════════ */}
        <TabsContent value="ot" className="space-y-6">
          {/* OT Rule Type Sub-tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: 'workday', label: 'Workday OT', icon: <Briefcase className="h-4 w-4" /> },
              { key: 'weekend', label: 'Weekend OT', icon: <Calendar className="h-4 w-4" /> },
              { key: 'holiday-ot', label: 'Holiday OT', icon: <PartyPopper className="h-4 w-4" /> },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setOtSubTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${
                  otSubTab === tab.key ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Workday OT ── */}
          {otSubTab === 'workday' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-blue-600" />
                    Workday OT Settings
                  </CardTitle>
                  <CardDescription>OT rules for regular weekdays (Mon-Fri)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Basic Rule</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">OT Start After</Label>
                        <Input type="time" value={otSettings.workdayRule.otStartAfter} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, otStartAfter: e.target.value } })} className="h-9" />
                        <p className="text-xs text-gray-400">Work after this = OT</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Minimum OT</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={otSettings.workdayRule.minimumOTMinutes} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, minimumOTMinutes: parseInt(e.target.value) || 0 } })} className="h-9" />
                          <span className="text-sm text-gray-500">mins</span>
                        </div>
                        <p className="text-xs text-gray-400">Below this = ignored</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label className="text-sm">Max OT (optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={otSettings.workdayRule.maxOTHours} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, maxOTHours: parseInt(e.target.value) || 0 } })} className="h-9 w-32" />
                        <span className="text-sm text-gray-500">hours</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">OT Rate</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">OT Multiplier</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" step="0.1" min="1" value={otSettings.workdayRule.rate} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, rate: parseFloat(e.target.value) || 1 } })} className="h-9 w-24" />
                          <span className="text-lg font-semibold text-blue-600">x</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Rounding</Label>
                        <Select value={String(otSettings.workdayRule.roundingMinutes)} onValueChange={v => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, roundingMinutes: parseInt(v) } })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-600" />
                    Logic Preview & Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-blue-800 uppercase tracking-wide mb-2">How It Works</p>
                    <div className="font-mono text-xs space-y-1.5 text-blue-900">
                      <p>if check-out {'>'} {otSettings.workdayRule.otStartAfter}</p>
                      <p className="pl-4">→ OT = (check-out - {otSettings.workdayRule.otStartAfter}) × {otSettings.workdayRule.rate}</p>
                      <p className="pl-4 text-blue-600">round to nearest {otSettings.workdayRule.roundingMinutes}min</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example Scenario</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Check-out time</span><span className="font-medium">18:30</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">OT starts at</span><span className="font-medium">{otSettings.workdayRule.otStartAfter}</span></div>
                      <div className="border-t pt-2 flex justify-between"><span className="text-gray-600">Raw OT</span><span className="font-medium">1h 30min</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">After rounding</span><span className="font-medium">1.5h</span></div>
                      <div className="flex justify-between bg-blue-100 -mx-4 px-4 py-2 rounded">
                        <span className="font-medium text-blue-800">OT Pay</span>
                        <span className="font-semibold text-blue-800">1.5h × {otSettings.workdayRule.rate}x = {(1.5 * otSettings.workdayRule.rate).toFixed(2)}h equivalent</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Weekend OT ── */}
          {otSubTab === 'weekend' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-orange-600" />
                    Weekend OT Settings
                  </CardTitle>
                  <CardDescription>OT rules for Saturday & Sunday. Entire working time = OT</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 border-2 border-orange-200 bg-orange-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-orange-800">Count All Hours as OT</p>
                      <p className="text-xs text-orange-600">All working hours on weekends are counted as overtime</p>
                    </div>
                    <Switch checked={otSettings.weekendRule.countAllHoursAsOT} onCheckedChange={v => setOtSettings({ ...otSettings, weekendRule: { ...otSettings.weekendRule, countAllHoursAsOT: v } })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">OT Multiplier</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.1" min="1" value={otSettings.weekendRule.rate} onChange={e => setOtSettings({ ...otSettings, weekendRule: { ...otSettings.weekendRule, rate: parseFloat(e.target.value) || 1 } })} className="h-9 w-24" />
                        <span className="text-lg font-semibold text-orange-600">x</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Minimum Work Time</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={otSettings.weekendRule.minimumWorkMinutes} onChange={e => setOtSettings({ ...otSettings, weekendRule: { ...otSettings.weekendRule, minimumWorkMinutes: parseInt(e.target.value) || 0 } })} className="h-9" />
                        <span className="text-sm text-gray-500">mins</span>
                      </div>
                      <p className="text-xs text-gray-400">Must work at least this to count</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Rounding</Label>
                    <Select value={String(otSettings.weekendRule.roundingMinutes)} onValueChange={v => setOtSettings({ ...otSettings, weekendRule: { ...otSettings.weekendRule, roundingMinutes: parseInt(v) } })}>
                      <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-orange-600" />
                    Logic Preview & Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-orange-800 uppercase tracking-wide mb-2">How It Works</p>
                    <div className="font-mono text-xs space-y-1.5 text-orange-900">
                      <p>if working on Saturday/Sunday</p>
                      <p className="pl-4">→ All hours = OT × {otSettings.weekendRule.rate}</p>
                      <p className="pl-4 text-orange-600">min work: {otSettings.weekendRule.minimumWorkMinutes}min required</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example Scenario</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Day</span><Badge className="bg-orange-100 text-orange-700 border-0">Saturday</Badge></div>
                      <div className="flex justify-between"><span className="text-gray-600">Work time</span><span className="font-medium">08:00 - 14:00</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Total hours</span><span className="font-medium">6h</span></div>
                      <div className="border-t pt-2 flex justify-between bg-orange-100 -mx-4 px-4 py-2 rounded">
                        <span className="font-medium text-orange-800">OT Pay</span>
                        <span className="font-semibold text-orange-800">6h × {otSettings.weekendRule.rate}x = {(6 * otSettings.weekendRule.rate).toFixed(1)}h equivalent</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Holiday OT ── */}
          {otSubTab === 'holiday-ot' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PartyPopper className="h-5 w-5 text-red-600" />
                    Holiday OT Settings
                  </CardTitle>
                  <CardDescription>Highest priority rule. All work on holidays = premium OT</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-sm">Holiday Source</Label>
                    <Select value={otSettings.holidayRule.holidaySource} onValueChange={v => setOtSettings({ ...otSettings, holidayRule: { ...otSettings.holidayRule, holidaySource: v as 'system_calendar' | 'manual' } })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system_calendar">System Calendar (Holiday tab)</SelectItem>
                        <SelectItem value="manual">Manual Configuration</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">{otSettings.holidayRule.holidaySource === 'system_calendar' ? `Using ${holidays.length} holidays from Holiday tab` : 'Manually specify holiday dates'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">OT Multiplier</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.1" min="1" value={otSettings.holidayRule.rate} onChange={e => setOtSettings({ ...otSettings, holidayRule: { ...otSettings.holidayRule, rate: parseFloat(e.target.value) || 1 } })} className="h-9 w-24" />
                        <span className="text-lg font-semibold text-red-600">x</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Rounding</Label>
                      <Select value={String(otSettings.holidayRule.roundingMinutes)} onValueChange={v => setOtSettings({ ...otSettings, holidayRule: { ...otSettings.holidayRule, roundingMinutes: parseInt(v) } })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Special Holiday Bonus</p>
                        <p className="text-xs text-gray-400">Additional flat bonus for working on holidays</p>
                      </div>
                      <Switch checked={otSettings.holidayRule.specialBonusEnabled} onCheckedChange={v => setOtSettings({ ...otSettings, holidayRule: { ...otSettings.holidayRule, specialBonusEnabled: v } })} />
                    </div>
                    {otSettings.holidayRule.specialBonusEnabled && (
                      <div className="mt-3 space-y-2 pl-4 border-l-2 border-red-200">
                        <Label className="text-sm">Bonus Amount (USD)</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">$</span>
                          <Input type="number" value={otSettings.holidayRule.specialBonusAmount} onChange={e => setOtSettings({ ...otSettings, holidayRule: { ...otSettings.holidayRule, specialBonusAmount: parseFloat(e.target.value) || 0 } })} className="h-9 w-32" />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-red-600" />
                    Logic Preview & Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-red-800 uppercase tracking-wide mb-2">How It Works</p>
                    <div className="font-mono text-xs space-y-1.5 text-red-900">
                      <p>if date = Holiday (from calendar)</p>
                      <p className="pl-4">→ All work hours = OT × {otSettings.holidayRule.rate}</p>
                      {otSettings.holidayRule.specialBonusEnabled && <p className="pl-4 text-red-600">+ ${otSettings.holidayRule.specialBonusAmount} bonus</p>}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example Scenario</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">Day</span><Badge className="bg-red-100 text-red-700 border-0">Khmer New Year</Badge></div>
                      <div className="flex justify-between"><span className="text-gray-600">Work time</span><span className="font-medium">08:00 - 13:00</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Total hours</span><span className="font-medium">5h</span></div>
                      <div className="border-t pt-2 flex justify-between bg-red-100 -mx-4 px-4 py-2 rounded">
                        <span className="font-medium text-red-800">OT Pay</span>
                        <span className="font-semibold text-red-800">5h × {otSettings.holidayRule.rate}x = {(5 * otSettings.holidayRule.rate).toFixed(1)}h{otSettings.holidayRule.specialBonusEnabled ? ` + $${otSettings.holidayRule.specialBonusAmount}` : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Holidays ({holidays.length})</p>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setActiveTab('holiday')}>View All →</Button>
                    </div>
                    <div className="space-y-1.5">
                      {holidays.slice(0, 4).map(h => (
                        <div key={h.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{h.name}</span>
                          <span className="text-gray-400">{format(new Date(h.date), 'MMM dd')}</span>
                        </div>
                      ))}
                      {holidays.length > 4 && <p className="text-xs text-gray-400 text-center pt-1">+{holidays.length - 4} more</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Rule Priority ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Rule Priority Order
              </CardTitle>
              <CardDescription>When a day matches multiple rules, the highest priority is applied</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {[
                  { rank: 1, label: 'Holiday', rate: `${otSettings.holidayRule.rate}x`, color: 'bg-red-100 text-red-800 border-red-300', icon: <PartyPopper className="h-4 w-4" /> },
                  { rank: 2, label: 'Weekend', rate: `${otSettings.weekendRule.rate}x`, color: 'bg-orange-100 text-orange-800 border-orange-300', icon: <Calendar className="h-4 w-4" /> },
                  { rank: 3, label: 'Workday', rate: `${otSettings.workdayRule.rate}x`, color: 'bg-blue-100 text-blue-800 border-blue-300', icon: <Briefcase className="h-4 w-4" /> },
                ].map((item, idx) => (
                  <div key={item.label} className="flex items-center gap-3 flex-1">
                    <div className={`flex items-center gap-3 p-4 rounded-lg border-2 ${item.color} flex-1`}>
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white/60 font-semibold text-sm">{item.rank}</div>
                      <div>
                        <div className="flex items-center gap-1.5">{item.icon}<p className="font-medium text-sm">{item.label}</p></div>
                        <p className="text-xs opacity-75">Rate: {item.rate}</p>
                      </div>
                    </div>
                    {idx < 2 && <span className="text-gray-300 text-lg">→</span>}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800"><strong>Example:</strong> If a day is BOTH Weekend + Holiday → <strong>Holiday rule ({otSettings.holidayRule.rate}x)</strong> is applied, not Weekend ({otSettings.weekendRule.rate}x).</p>
              </div>
            </CardContent>
          </Card>

          {/* ── OT Calculation Mode ── */}
          <Card>
            <CardHeader><CardTitle className="text-base">OT Calculation Mode</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-5 border-2 rounded-lg cursor-pointer transition-all ${otSettings.calculationMode === 'factory' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`} onClick={() => setOtSettings({ ...otSettings, calculationMode: 'factory', requireApproval: false })}>
                  <div className="flex items-center gap-3 mb-2">
                    <Zap className={`h-5 w-5 ${otSettings.calculationMode === 'factory' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <p className="font-medium">Factory Mode (Automatic)</p>
                  </div>
                  <p className="text-sm text-gray-600">Auto-calculate OT based on check-out time. No approval needed. Ideal for factory/production.</p>
                </div>
                <div className={`p-5 border-2 rounded-lg cursor-pointer transition-all ${otSettings.calculationMode === 'office' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`} onClick={() => setOtSettings({ ...otSettings, calculationMode: 'office', requireApproval: true })}>
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className={`h-5 w-5 ${otSettings.calculationMode === 'office' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <p className="font-medium">Office Mode (Manual Approval)</p>
                  </div>
                  <p className="text-sm text-gray-600">Employees request OT and managers approve. OT only counted after approval. Ideal for office.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Department Assignments ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5" />Department OT Assignments</CardTitle>
                  <CardDescription>Assign custom OT rates to specific departments. Overrides default rules.</CardDescription>
                </div>
                <Dialog open={deptAssignDialogOpen} onOpenChange={setDeptAssignDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="mr-1.5 h-4 w-4" />Assign Rule</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign OT Rule to Department</DialogTitle>
                      <DialogDescription>Custom rules override default OT rates</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={newDeptAssign.department} onValueChange={v => setNewDeptAssign({ ...newDeptAssign, department: v })}>
                          <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>{mockDepartments.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Rule Label</Label>
                        <Input placeholder="e.g., Custom OT" value={newDeptAssign.ruleLabel} onChange={e => setNewDeptAssign({ ...newDeptAssign, ruleLabel: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2"><Label className="text-xs">Weekday Rate</Label><Input type="number" step="0.1" value={newDeptAssign.weekdayRate} onChange={e => setNewDeptAssign({ ...newDeptAssign, weekdayRate: parseFloat(e.target.value) || 1 })} className="h-9" /></div>
                        <div className="space-y-2"><Label className="text-xs">Weekend Rate</Label><Input type="number" step="0.1" value={newDeptAssign.weekendRate} onChange={e => setNewDeptAssign({ ...newDeptAssign, weekendRate: parseFloat(e.target.value) || 1 })} className="h-9" /></div>
                        <div className="space-y-2"><Label className="text-xs">Holiday Rate</Label><Input type="number" step="0.1" value={newDeptAssign.holidayRate} onChange={e => setNewDeptAssign({ ...newDeptAssign, holidayRate: parseFloat(e.target.value) || 1 })} className="h-9" /></div>
                      </div>
                      <Button className="w-full" onClick={() => {
                        if (!newDeptAssign.department) { toast.error('Select a department'); return; }
                        const id = `DA${String(otSettings.departmentAssignments.length + 1).padStart(3, '0')}`;
                        setOtSettings({ ...otSettings, departmentAssignments: [...otSettings.departmentAssignments, { id, ...newDeptAssign }] });
                        setNewDeptAssign({ department: '', ruleLabel: '', weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 });
                        setDeptAssignDialogOpen(false);
                        toast.success('Department OT rule assigned');
                      }}>Assign Rule</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {otSettings.departmentAssignments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No custom department rules. All departments use default OT rates.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead className="text-center">Weekday</TableHead>
                      <TableHead className="text-center">Weekend</TableHead>
                      <TableHead className="text-center">Holiday</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otSettings.departmentAssignments.map(assign => (
                      <TableRow key={assign.id}>
                        <TableCell className="font-medium text-sm">{assign.department}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{assign.ruleLabel || 'Custom'}</Badge></TableCell>
                        <TableCell className="text-center"><span className="text-sm font-medium text-blue-600">{assign.weekdayRate}x</span></TableCell>
                        <TableCell className="text-center"><span className="text-sm font-medium text-orange-600">{assign.weekendRate}x</span></TableCell>
                        <TableCell className="text-center"><span className="text-sm font-medium text-red-600">{assign.holidayRate}x</span></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => { setOtSettings({ ...otSettings, departmentAssignments: otSettings.departmentAssignments.filter(a => a.id !== assign.id) }); toast.success('Assignment removed'); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Summary Comparison ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Info className="h-5 w-5" />OT Rules Summary</CardTitle>
              <CardDescription>Side-by-side comparison of all OT types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-blue-600" /><p className="font-medium text-sm text-blue-800">Workday</p></div>
                  <div className="text-3xl font-bold text-blue-700">{otSettings.workdayRule.rate}x</div>
                  <div className="text-xs text-blue-600 space-y-1"><p>After {otSettings.workdayRule.otStartAfter}</p><p>Min {otSettings.workdayRule.minimumOTMinutes}min / Max {otSettings.workdayRule.maxOTHours}h</p></div>
                  <div className="font-mono text-xs text-blue-900 bg-white rounded p-2">18:30 out → 1.5h × {otSettings.workdayRule.rate} = {(1.5 * otSettings.workdayRule.rate).toFixed(2)}h</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-600" /><p className="font-medium text-sm text-orange-800">Weekend</p></div>
                  <div className="text-3xl font-bold text-orange-700">{otSettings.weekendRule.rate}x</div>
                  <div className="text-xs text-orange-600 space-y-1"><p>{otSettings.weekendRule.countAllHoursAsOT ? 'All hours = OT' : 'After standard hours'}</p><p>Min {otSettings.weekendRule.minimumWorkMinutes}min required</p></div>
                  <div className="font-mono text-xs text-orange-900 bg-white rounded p-2">6h work → 6h × {otSettings.weekendRule.rate} = {(6 * otSettings.weekendRule.rate).toFixed(1)}h</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><PartyPopper className="h-4 w-4 text-red-600" /><p className="font-medium text-sm text-red-800">Holiday</p></div>
                  <div className="text-3xl font-bold text-red-700">{otSettings.holidayRule.rate}x</div>
                  <div className="text-xs text-red-600 space-y-1"><p>Highest priority rule</p><p>{otSettings.holidayRule.specialBonusEnabled ? `+ $${otSettings.holidayRule.specialBonusAmount} bonus` : 'No special bonus'}</p></div>
                  <div className="font-mono text-xs text-red-900 bg-white rounded p-2">5h work → 5h × {otSettings.holidayRule.rate} = {(5 * otSettings.holidayRule.rate).toFixed(1)}h</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ HOLIDAY TAB ═══════════════ */}
        <TabsContent value="holiday" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Total Holidays</CardTitle>
                <CalendarDays className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredHolidays.length}</div>
                <p className="text-xs text-gray-500">Configured holidays</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Public Holidays</CardTitle>
                <CalendarDays className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredHolidays.filter(h => h.type === 'public').length}</div>
                <p className="text-xs text-gray-500">National holidays</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Company Holidays</CardTitle>
                <CalendarDays className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredHolidays.filter(h => h.type === 'company').length}</div>
                <p className="text-xs text-gray-500">Internal holidays</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Holiday Calendar</CardTitle>
                  <CardDescription>Manage public and company holidays</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-8 w-36"
                    placeholder="From"
                    onChange={e => setDateFilter({ ...dateFilter, start: e.target.value || null })}
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <Input
                    type="date"
                    className="h-8 w-36"
                    placeholder="To"
                    onChange={e => setDateFilter({ ...dateFilter, end: e.target.value || null })}
                  />
                  <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Holiday
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Holiday</DialogTitle>
                        <DialogDescription>Configure a new public or company holiday</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Holiday Name</Label>
                          <Input placeholder="e.g., Independence Day" value={newHoliday.name} onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={newHoliday.type} onValueChange={v => setNewHoliday({ ...newHoliday, type: v as 'public' | 'company' })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">Public Holiday</SelectItem>
                              <SelectItem value="company">Company Holiday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={newHoliday.isPaid} onCheckedChange={v => setNewHoliday({ ...newHoliday, isPaid: v })} />
                          <Label>Paid Holiday</Label>
                        </div>
                        <div className="space-y-2">
                          <Label>Description (Optional)</Label>
                          <Input placeholder="Additional notes" value={newHoliday.description} onChange={e => setNewHoliday({ ...newHoliday, description: e.target.value })} />
                        </div>
                        <Button onClick={handleAddHoliday} className="w-full">Add Holiday</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Holiday Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHolidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-400">No holidays found</TableCell>
                    </TableRow>
                  ) : (
                    holidaysPagination.paginatedItems.map(holiday => (
                      <TableRow key={holiday.id}>
                        <TableCell className="font-medium text-sm">{format(new Date(holiday.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="text-sm">{holiday.name}</TableCell>
                        <TableCell>
                          <Badge variant={holiday.type === 'public' ? 'default' : 'secondary'}>{holiday.type}</Badge>
                        </TableCell>
                        <TableCell>
                          {holiday.isPaid ? (
                            <Badge className="bg-green-100 text-green-800 border-0">Paid</Badge>
                          ) : (
                            <Badge variant="outline">Unpaid</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{holiday.description || '-'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => handleDeleteHoliday(holiday.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <Pagination
                currentPage={holidaysPagination.currentPage}
                totalPages={holidaysPagination.totalPages}
                onPageChange={holidaysPagination.goToPage}
                startIndex={holidaysPagination.startIndex}
                endIndex={holidaysPagination.endIndex}
                totalItems={holidaysPagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ GENERAL TAB ═══════════════ */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Absent & Missing Punch Rules</CardTitle>
                <CardDescription>Configure when and how the system flags issues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-mark Absent</p>
                    <p className="text-xs text-gray-400">Automatically mark employees with no check-in as absent</p>
                  </div>
                  <Switch
                    checked={generalSettings.autoMarkAbsent}
                    onCheckedChange={v => setGeneralSettings({ ...generalSettings, autoMarkAbsent: v })}
                  />
                </div>

                {generalSettings.autoMarkAbsent && (
                  <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                    <Label className="text-sm">Absent Deadline</Label>
                    <Input
                      type="time"
                      value={generalSettings.absentDeadlineTime}
                      onChange={e => setGeneralSettings({ ...generalSettings, absentDeadlineTime: e.target.value })}
                      className="w-36 h-9"
                    />
                    <p className="text-xs text-gray-400">
                      If no check-in by this time, mark as absent
                    </p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Track Missing Check-out</p>
                      <p className="text-xs text-gray-400">Flag employees who checked in but didn't check out</p>
                    </div>
                    <Switch
                      checked={generalSettings.trackMissingPunch}
                      onCheckedChange={v => setGeneralSettings({ ...generalSettings, trackMissingPunch: v })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notifications</CardTitle>
                <CardDescription>Alert preferences for attendance issues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Notify Manager</p>
                    <p className="text-xs text-gray-400">Send alerts to managers about team attendance issues</p>
                  </div>
                  <Switch
                    checked={generalSettings.notifyManager}
                    onCheckedChange={v => setGeneralSettings({ ...generalSettings, notifyManager: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Notify Employee</p>
                    <p className="text-xs text-gray-400">Send reminders to employees about missing punches</p>
                  </div>
                  <Switch
                    checked={generalSettings.notifyEmployee}
                    onCheckedChange={v => setGeneralSettings({ ...generalSettings, notifyEmployee: v })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekend Configuration</CardTitle>
                <CardDescription>Define which days are weekends (no attendance required)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const isWeekend = generalSettings.weekendDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          setGeneralSettings({
                            ...generalSettings,
                            weekendDays: isWeekend
                              ? generalSettings.weekendDays.filter(d => d !== day)
                              : [...generalSettings.weekendDays, day],
                          });
                        }}
                        className={`py-3 rounded-lg text-xs font-medium transition-colors ${
                          isWeekend
                            ? 'bg-red-100 text-red-700 border-2 border-red-300'
                            : 'bg-green-50 text-green-700 border-2 border-green-200'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded bg-green-400" /> Work day
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded bg-red-400" /> Weekend
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Access Permissions</CardTitle>
                <CardDescription>Who can access and modify attendance settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { role: 'Admin', access: 'Full edit', color: 'bg-red-50 text-red-700 border-red-200' },
                    { role: 'Manager', access: 'View only', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                    { role: 'Employee', access: 'No access', color: 'bg-gray-50 text-gray-500 border-gray-200' },
                  ].map(item => (
                    <div key={item.role} className={`flex items-center justify-between p-3 rounded-lg border ${item.color}`}>
                      <span className="font-medium text-sm">{item.role}</span>
                      <Badge variant="outline" className="text-xs">{item.access}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers used by the Shift edit dialog (scan mode, grace, half-day, preview)
// ════════════════════════════════════════════════════════════════════════════

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function TimeField({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type="time" value={value} onChange={e => onChange(e.target.value)} className="h-9" />
    </div>
  );
}
/**
 * Inline editor for the tenant-wide scan rule. Everything (mode, target
 * times, grace, half-day, preview) is visible on the Settings page instead
 * of hidden behind a dialog. Changes are persisted on Save.
 */
function ScanRuleCard({
  rule,
  onChange,
}: {
  rule: ScanRule;
  onChange: (next: ScanRule) => void;
}) {
  const [draft, setDraft] = useState<ScanRule>(rule);
  useEffect(() => { setDraft(rule); }, [rule]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
  const setMode = (mode: ScanMode) => setDraft({ ...draft, mode });

  const addGrace = (time: string, minutes: number) => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + (minutes || 0);
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const handleSave = () => {
    const saved = saveScanRule(draft);
    onChange(saved);
    toast.success(
      draft.mode === 'two' ? 'Scan rule saved: 2 scans per day' : 'Scan rule saved: 4 scans per day',
    );
  };

  const handleReset = () => {
    const saved = saveScanRule(DEFAULT_SCAN_RULE);
    onChange(saved);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Punch Scan Rule
            </CardTitle>
            <CardDescription>
              How many times per day employees are expected to punch, and the
              target times that determine on-time / late / early status.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-[11px] text-amber-600 font-medium">Unsaved changes</span>}
            <Badge variant="outline" className="text-[11px]">
              Last updated {format(new Date(rule.updatedAt), 'MMM dd, HH:mm')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode selector */}
        <div>
          <Label className="text-sm font-semibold">Scan mode</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <ScanModeOption
              active={draft.mode === 'two'}
              title="2 scans per day"
              subtitle="Morning check-in + evening check-out (one continuous session)"
              onClick={() => setMode('two')}
            />
            <ScanModeOption
              active={draft.mode === 'four'}
              title="4 scans per day"
              subtitle="Morning in/out + afternoon in/out (two sessions)"
              onClick={() => setMode('four')}
            />
          </div>
        </div>

        {/* Target times */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Target times</Label>
          {draft.mode === 'four' ? (
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                label="Morning check-in (on or before)"
                value={draft.morningIn}
                onChange={v => setDraft({ ...draft, morningIn: v })}
              />
              <TimeField
                label="Morning check-out (on or after)"
                value={draft.morningOut}
                onChange={v => setDraft({ ...draft, morningOut: v })}
              />
              <TimeField
                label="Afternoon check-in (on or before)"
                value={draft.afternoonIn}
                onChange={v => setDraft({ ...draft, afternoonIn: v })}
              />
              <TimeField
                label="Evening check-out (on or after)"
                value={draft.eveningOut}
                onChange={v => setDraft({ ...draft, eveningOut: v })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                label="Morning check-in (on or before)"
                value={draft.morningIn}
                onChange={v => setDraft({ ...draft, morningIn: v })}
              />
              <TimeField
                label="Evening check-out (on or after)"
                value={draft.eveningOut}
                onChange={v => setDraft({ ...draft, eveningOut: v })}
              />
            </div>
          )}
        </div>

        {/* Grace window */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Grace minutes after IN</Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.graceInMinutes}
              onChange={e => setDraft({ ...draft, graceInMinutes: clamp(Number(e.target.value), 0, 60) })}
            />
            <p className="text-[11px] text-gray-500">
              Late after {addGrace(draft.morningIn, draft.graceInMinutes)}.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Grace minutes before OUT</Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.graceOutMinutes}
              onChange={e => setDraft({ ...draft, graceOutMinutes: clamp(Number(e.target.value), 0, 60) })}
            />
            <p className="text-[11px] text-gray-500">A check-out this many minutes early still counts as on-time.</p>
          </div>
        </div>

        {/* Half-day toggle (2-scan only) */}
        {draft.mode === 'two' && (
          <div className="flex items-start justify-between gap-4 p-3 rounded-md border bg-gray-50">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Half-day leave counts as half-scan</p>
              <p className="text-[11px] text-gray-500">
                When an employee has approved half-day leave (AM or PM), skip the absent half
                and only evaluate the half they worked.
              </p>
            </div>
            <Switch
              checked={draft.halfDayCountsAsHalfScan}
              onCheckedChange={v => setDraft({ ...draft, halfDayCountsAsHalfScan: v })}
            />
          </div>
        )}

        {/* Live preview */}
        <ScanRulePreview rule={draft} />

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty}>
            <Save className="h-4 w-4 mr-1.5" />
            Save rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function ScanModeOption({
  active, title, subtitle, onClick,
}: {
  active: boolean; title: string; subtitle: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all ${
        active
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{title}</p>
        {active && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
    </button>
  );
}

/** Canned-scenarios preview that runs against a ScanRule draft. */
function ScanRulePreview({ rule }: { rule: ScanRule }) {
  const scenarios = previewScenarios(rule.mode);
  return (
    <div className="rounded-md border bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Preview</p>
      <div className="space-y-1.5">
        {scenarios.map(sc => (
          <div key={sc.label} className="flex items-start gap-3 text-xs">
            <span className="w-40 shrink-0 text-gray-700 font-medium">{sc.label}</span>
            <div className="flex-1 flex flex-wrap gap-2">
              {evaluate(rule, sc.punches).map((s, i) => <VerdictChip key={i} session={s} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerdictChip({ session }: { session: EvaluatedSession }) {
  const style: Record<string, string> = {
    on_time:        'bg-green-100 text-green-800',
    late_in:        'bg-yellow-100 text-yellow-800',
    early_out:      'bg-orange-100 text-orange-800',
    late_and_early: 'bg-red-100 text-red-800',
    no_in:          'bg-red-100 text-red-800',
    no_out:         'bg-red-100 text-red-800',
    missing:        'bg-gray-200 text-gray-700',
  };
  const label: Record<string, string> = {
    on_time: 'On-time', late_in: 'Late in', early_out: 'Early out',
    late_and_early: 'Late + early', no_in: 'No check-in', no_out: 'No check-out',
    missing: 'No scan',
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border bg-white">
      <span className="text-gray-500">{session.label}:</span>
      <span className={`rounded px-1.5 py-0.5 ${style[session.verdict]}`}>
        {label[session.verdict]}
      </span>
      <span className="text-gray-400 font-mono">
        {session.actualIn ?? '— —'} / {session.actualOut ?? '— —'}
      </span>
    </span>
  );
}
