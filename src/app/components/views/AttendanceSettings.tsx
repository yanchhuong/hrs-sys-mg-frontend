import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
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
import * as departmentsApi from '../../api/departments';
import { mockHolidays } from '../../data/timeworkData';
import { Holiday as HolidayView } from './Holiday';
import { AttendanceRule, OTSettings } from '../../types/settings';
import { Holiday } from '../../types/timework';
import * as settingsApi from '../../api/settings';
import { USE_MOCKS } from '../../api/client';
import {
  Settings, Clock, Save, Coffee, ArrowRightLeft, AlertTriangle, Timer,
  Plus, Trash2, Pencil, CheckCircle2, XCircle, Info, Zap, Building2, CalendarDays,
  Briefcase, Calendar, PartyPopper, Shield, Users, Moon,
} from 'lucide-react';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  ScanMode, ScanRule, DEFAULT_SCAN_RULE,
  loadScanRule, saveScanRule,
  evaluate, previewScenarios, EvaluatedSession,
} from '../../utils/scanRule';
import { FlexibleWorkCard } from '../common/FlexibleWorkCard';

function adaptHoliday(h: settingsApi.Holiday): Holiday {
  // The Holiday Calendar's job is to mark non-working dates so the
  // attendance evaluator skips them — pay status is irrelevant here.
  return {
    id: h.id,
    name: h.name,
    date: h.date,
    type: h.type === 'company' ? 'company' : 'public',
    description: h.description,
  };
}

/** Small (i) icon + tooltip pair used to demote inline helper text
 *  into hover-only hints. Same pattern as the AccountingSettings
 *  dialog so the visual language stays consistent across the
 *  Settings surface. */
function HelpHint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-gray-400 hover:text-gray-600 cursor-help">
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AttendanceSettings() {
  const { t } = useI18n();
  // Update permission on the 'settings' module gates the Save All button.
  // Roles that only have View on settings still see the page (helpful as a
  // read-only reference) but can't persist changes.
  const { canUpdate } = useAuth();
  const canEditSettings = canUpdate('settings');
  // Kept for OT-tab cross-references (activeShift) — no per-shift UI anymore;
  // per-employee work schedules are assigned on the Employee record.
  const [shifts] = useState<AttendanceRule[]>(mockAttendanceRules);
  const [otSettings, setOtSettings] = useState<OTSettings>(USE_MOCKS ? defaultOTSettings : { ...defaultOTSettings });
  const [, setLoadingOt] = useState(false);
  const [scanRule, setScanRule] = useState<ScanRule>(() => loadScanRule());
  const [activeTab, setActiveTab] = useState('scan');
  const [otSubTab, setOtSubTab] = useState('workday');
  const [deptAssignDialogOpen, setDeptAssignDialogOpen] = useState(false);
  const [newDeptAssign, setNewDeptAssign] = useState({ department: '', ruleLabel: '', weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 });
  // Live Department / Group / Team list. Drives the picker in the Assign
  // OT Rule dialog so admins can scope a custom OT multiplier to a Group
  // or Team in addition to formal Departments. Falls back to mock data
  // until the API responds (or in mock mode).
  const [deptList, setDeptList] = useState<departmentsApi.Department[]>(
    USE_MOCKS ? mockDepartments.map(d => ({ id: d.id, name: d.name, type: 'department' })) : [],
  );

  // Holiday state
  const [holidays, setHolidays] = useState<Holiday[]>(USE_MOCKS ? mockHolidays : []);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '', type: 'public' as 'public' | 'company', description: '' });
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });

  const loadHolidays = async () => {
    if (USE_MOCKS) {
      setHolidays([...mockHolidays]);
      return;
    }
    try {
      const res = await settingsApi.listHolidays();
      setHolidays(res.map(adaptHoliday));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load holidays');
    }
  };

  const loadOtSettings = async () => {
    if (USE_MOCKS) return;
    setLoadingOt(true);
    try {
      const remote = await settingsApi.getOtSettings();
      setOtSettings(prev => ({
        ...prev,
        otStartAfter: remote.otStartAfter?.slice(0, 5) ?? prev.otStartAfter,
        minimumOTThresholdMinutes: remote.minimumOTThresholdMinutes ?? prev.minimumOTThresholdMinutes,
        otRoundingMinutes: remote.otRoundingMinutes ?? prev.otRoundingMinutes,
        weekdayRate: Number(remote.weekdayRate),
        weekendRate: Number(remote.weekendRate),
        holidayRate: Number(remote.holidayRate),
        maxOTHoursPerDay: Number(remote.maxOTHoursPerDay),
        requireApproval: remote.requireApproval,
        calculationMode: remote.calculationMode as OTSettings['calculationMode'],
        workdayRule: { ...prev.workdayRule, ...((remote.workdayRule as Partial<OTSettings['workdayRule']>) ?? {}) },
        weekendRule: { ...prev.weekendRule, ...((remote.weekendRule as Partial<OTSettings['weekendRule']>) ?? {}) },
        holidayRule: { ...prev.holidayRule, ...((remote.holidayRule as Partial<OTSettings['holidayRule']>) ?? {}) },
        // Night-work rule comes from flat columns on ot_settings (V58), not
        // a JSON blob like the other three — coerce + fall back to the
        // tenant default so an older row still renders the card sensibly.
        nightRule: {
          enabled:   remote.nightEnabled    ?? prev.nightRule.enabled,
          startTime: (remote.nightStartTime ?? prev.nightRule.startTime).slice(0, 5),
          endTime:   (remote.nightEndTime   ?? prev.nightRule.endTime).slice(0, 5),
          rate:      Number(remote.nightRate ?? prev.nightRule.rate),
          // V61 — composition mode. Coerce unknown values back to the
          // 'replace' default so a future enum addition can't crash the
          // page on a tenant that's already saved the new value.
          compose:   (remote.nightCompose === 'max' || remote.nightCompose === 'multiply' || remote.nightCompose === 'replace')
            ? remote.nightCompose
            : prev.nightRule.compose,
        },
        // Department assignments persist as a JSON list on the backend.
        // Coerce to the typed array if present, otherwise keep the empty
        // default so the rendered table still iterates safely.
        departmentAssignments: Array.isArray(remote.departmentAssignments)
          ? (remote.departmentAssignments as OTSettings['departmentAssignments'])
          : prev.departmentAssignments,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load OT settings');
    } finally {
      setLoadingOt(false);
    }
  };

  useEffect(() => {
    loadHolidays();
    loadOtSettings();
    loadGeneralSettings();
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pull the full Department / Group / Team list once on mount. */
  const loadDepartments = async () => {
    if (USE_MOCKS) return;
    try {
      const list = await departmentsApi.list();
      setDeptList(list);
    } catch (err) {
      console.warn('Could not load departments for OT rule picker', err);
    }
  };

  // General settings state
  const [generalSettings, setGeneralSettings] = useState({
    autoMarkAbsent: true,
    absentDeadlineTime: '10:00',
    trackMissingPunch: true,
    notifyManager: true,
    notifyEmployee: true,
    weekendDays: ['Saturday', 'Sunday'] as string[],
    /** V169 — Cambodian banks / factories often treat Saturday as a
     *  half workday. Mutual exclusion with weekendDays is enforced
     *  by the 3-state toggle below. */
    halfDayDays: [] as string[],
  });

  // Backend stores 3-letter codes ("Sat"); the chip UI expects long names
  // ("Saturday"). Convert at the wire boundary so the picker stays simple.
  const SHORT_TO_LONG: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };
  const LONG_TO_SHORT: Record<string, string> = Object.fromEntries(
    Object.entries(SHORT_TO_LONG).map(([s, l]) => [l, s]),
  );

  const loadGeneralSettings = async () => {
    if (USE_MOCKS) return;
    try {
      const remote = await settingsApi.getGeneralAttendanceSettings();
      setGeneralSettings({
        autoMarkAbsent: remote.autoMarkAbsent,
        absentDeadlineTime: remote.absentDeadlineTime,
        trackMissingPunch: remote.trackMissingCheckout,
        notifyManager: remote.notifyManager,
        notifyEmployee: remote.notifyEmployee,
        weekendDays: (remote.weekendDays || []).map(d => SHORT_TO_LONG[d] ?? d),
        halfDayDays: (remote.halfDayDays || []).map(d => SHORT_TO_LONG[d] ?? d),
      });
    } catch (err) {
      console.warn('Could not load General attendance settings', err);
    }
  };

  const handleSave = async () => {
    if (USE_MOCKS) {
      toast.success('Attendance settings saved successfully');
      return;
    }
    try {
      await Promise.all([
        settingsApi.updateOtSettings({
          otStartAfter: otSettings.otStartAfter.length === 5 ? otSettings.otStartAfter + ':00' : otSettings.otStartAfter,
          minimumOTThresholdMinutes: otSettings.minimumOTThresholdMinutes,
          otRoundingMinutes: otSettings.otRoundingMinutes,
          weekdayRate: otSettings.weekdayRate,
          weekendRate: otSettings.weekendRate,
          holidayRate: otSettings.holidayRate,
          maxOTHoursPerDay: otSettings.maxOTHoursPerDay,
          requireApproval: otSettings.requireApproval,
          calculationMode: otSettings.calculationMode,
          workdayRule: otSettings.workdayRule as unknown as Record<string, unknown>,
          weekendRule: otSettings.weekendRule as unknown as Record<string, unknown>,
          holidayRule: otSettings.holidayRule as unknown as Record<string, unknown>,
          // Night-work fields are flat columns (V58), serialised here.
          // LocalTime on the backend tolerates the bare HH:mm form Tomcat /
          // Jackson parses, so the :00 suffix that we tack onto otStartAfter
          // isn't needed here.
          nightEnabled:   otSettings.nightRule.enabled,
          nightRate:      otSettings.nightRule.rate,
          nightStartTime: otSettings.nightRule.startTime,
          nightEndTime:   otSettings.nightRule.endTime,
          nightCompose:   otSettings.nightRule.compose,
          // Persist the per-department/group/team OT rule list. Backend
          // stores it as a JSON column verbatim (Object → list of rows
          // with id/department/ruleLabel/weekdayRate/weekendRate/holidayRate).
          departmentAssignments: otSettings.departmentAssignments,
        }),
        settingsApi.updateGeneralAttendanceSettings({
          autoMarkAbsent: generalSettings.autoMarkAbsent,
          absentDeadlineTime: generalSettings.absentDeadlineTime,
          trackMissingCheckout: generalSettings.trackMissingPunch,
          notifyManager: generalSettings.notifyManager,
          notifyEmployee: generalSettings.notifyEmployee,
          // Convert long day names back to the 3-letter codes the backend stores.
          weekendDays: generalSettings.weekendDays.map(d => LONG_TO_SHORT[d] ?? d),
          halfDayDays: generalSettings.halfDayDays.map(d => LONG_TO_SHORT[d] ?? d),
        }),
      ]);
      toast.success('Attendance settings saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) { toast.error('Please fill in name and date'); return; }
    if (USE_MOCKS) {
      const holiday: Holiday = { id: `HOL${String(holidays.length + 1).padStart(3, '0')}`, ...newHoliday };
      setHolidays([...holidays, holiday]);
      setNewHoliday({ name: '', date: '', type: 'public' as 'public' | 'company', description: '' });
      setHolidayDialogOpen(false);
      toast.success('Holiday added successfully');
      return;
    }
    try {
      await settingsApi.createHoliday({
        name: newHoliday.name,
        date: newHoliday.date,
        // Backend validates the type pattern as `public|company` — no remap.
        type: newHoliday.type,
        description: newHoliday.description,
      });
      await loadHolidays();
      setNewHoliday({ name: '', date: '', type: 'public' as 'public' | 'company', description: '' });
      setHolidayDialogOpen(false);
      toast.success('Holiday added successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (USE_MOCKS) {
      setHolidays(holidays.filter(h => h.id !== id));
      toast.success('Holiday deleted');
      return;
    }
    try {
      await settingsApi.removeHoliday(id);
      await loadHolidays();
      toast.success('Holiday deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
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
          <h1 className="text-3xl font-bold">{t('page.attendance_settings.title')}</h1>
        </div>
        {canEditSettings && (
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            {t('page.attendance_settings.save_all')}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="scan" className="gap-1.5">
            <ArrowRightLeft className="h-4 w-4" />
            {t('page.attendance_settings.tab.scan')}
          </TabsTrigger>
          <TabsTrigger value="flexible" className="gap-1.5">
            <Users className="h-4 w-4" />
            {t('page.attendance_settings.tab.flexible')}
          </TabsTrigger>
          <TabsTrigger value="ot" className="gap-1.5">
            <Timer className="h-4 w-4" />
            {t('page.attendance_settings.tab.ot')}
          </TabsTrigger>
          <TabsTrigger value="holiday" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {t('page.attendance_settings.tab.holiday')}
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-4 w-4" />
            {t('page.attendance_settings.tab.general')}
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
              { key: 'night', label: 'Night Work', icon: <Moon className="h-4 w-4" /> },
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
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Basic Rule</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          OT Start After
                          <HelpHint>Work after this = OT.</HelpHint>
                        </Label>
                        <Input type="time" value={otSettings.workdayRule.otStartAfter} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, otStartAfter: e.target.value } })} className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          Minimum OT
                          <HelpHint>Below this = ignored.</HelpHint>
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={otSettings.workdayRule.minimumOTMinutes} onChange={e => setOtSettings({ ...otSettings, workdayRule: { ...otSettings.workdayRule, minimumOTMinutes: parseInt(e.target.value) || 0 } })} className="h-9" />
                          <span className="text-sm text-gray-500">mins</span>
                        </div>
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
                    <div className="tabular-nums text-xs space-y-1.5 text-blue-900">
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
                      <Label className="text-sm inline-flex items-center gap-1.5">
                        Minimum Work Time
                        <HelpHint>Must work at least this to count.</HelpHint>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={otSettings.weekendRule.minimumWorkMinutes} onChange={e => setOtSettings({ ...otSettings, weekendRule: { ...otSettings.weekendRule, minimumWorkMinutes: parseInt(e.target.value) || 0 } })} className="h-9" />
                        <span className="text-sm text-gray-500">mins</span>
                      </div>
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
                    <div className="tabular-nums text-xs space-y-1.5 text-orange-900">
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
                      <p className="text-sm font-medium inline-flex items-center gap-1.5">
                        Special Holiday Bonus
                        <HelpHint>Additional flat bonus for working on holidays.</HelpHint>
                      </p>
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
                    <div className="tabular-nums text-xs space-y-1.5 text-red-900">
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

          {/* ── Night Work OT ── */}
          {otSubTab === 'night' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Moon className="h-5 w-5 text-indigo-600" />
                    Night Work Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-start justify-between gap-4 rounded-lg border bg-indigo-50/40 border-indigo-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Enable Night-Work Multiplier</p>
                      <p className="text-xs text-indigo-700/80">When off, OT during night hours uses only the day-type rate.</p>
                    </div>
                    <Switch
                      checked={otSettings.nightRule.enabled}
                      onCheckedChange={v => setOtSettings({ ...otSettings, nightRule: { ...otSettings.nightRule, enabled: v } })}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Night Window</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          Start (inclusive)
                          <HelpHint>Hours at or after this count as night.</HelpHint>
                        </Label>
                        <Input
                          type="time"
                          value={otSettings.nightRule.startTime}
                          disabled={!otSettings.nightRule.enabled}
                          onChange={e => setOtSettings({ ...otSettings, nightRule: { ...otSettings.nightRule, startTime: e.target.value } })}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          End (exclusive)
                          <HelpHint>May wrap past midnight (e.g. 22:00 → 05:00).</HelpHint>
                        </Label>
                        <Input
                          type="time"
                          value={otSettings.nightRule.endTime}
                          disabled={!otSettings.nightRule.enabled}
                          onChange={e => setOtSettings({ ...otSettings, nightRule: { ...otSettings.nightRule, endTime: e.target.value } })}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Multiplier</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          Night Multiplier
                          <HelpHint>Default 1.30× per Cambodian Labour Law Art. 162.</HelpHint>
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="1"
                            value={otSettings.nightRule.rate}
                            disabled={!otSettings.nightRule.enabled}
                            onChange={e => setOtSettings({ ...otSettings, nightRule: { ...otSettings.nightRule, rate: parseFloat(e.target.value) || 1 } })}
                            className="h-9 w-24"
                          />
                          <span className="text-lg font-semibold text-indigo-600">x</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm inline-flex items-center gap-1.5">
                          When in night window
                          {/* Dynamic hint — depends on compose mode. Tooltip
                              keeps the row tight; the dropdown label
                              itself already names the mode. */}
                          <HelpHint>
                            {otSettings.nightRule.compose === 'replace'
                              ? 'Night rate wins outright when overlapping the window.'
                              : otSettings.nightRule.compose === 'max'
                                ? 'Effective = max(dayType, night) — never lowers weekend or holiday pay.'
                                : 'Effective = dayType × night — compound model (Sat night = weekend × night).'}
                          </HelpHint>
                        </Label>
                        <Select
                          value={otSettings.nightRule.compose}
                          disabled={!otSettings.nightRule.enabled}
                          onValueChange={v => setOtSettings({ ...otSettings, nightRule: { ...otSettings.nightRule, compose: v as 'replace' | 'max' | 'multiply' } })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="replace">Replace day-type rate</SelectItem>
                            <SelectItem value="max">Max of day-type and night</SelectItem>
                            <SelectItem value="multiply">Multiply day-type × night</SelectItem>
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
                    <Info className="h-5 w-5 text-indigo-600" />
                    Logic Preview & Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Helpers — keep the worked examples in lockstep with
                      the picked composition mode so HR sees their choice
                      reflected live in the preview numbers. */}
                  {(() => {
                    const compose = otSettings.nightRule.compose;
                    const night = otSettings.nightRule.rate;
                    const composeOf = (dayRate: number) =>
                      compose === 'max' ? Math.max(dayRate, night)
                      : compose === 'multiply' ? dayRate * night
                      : night;
                    const composeFormula = (dayLabel: string, dayRate: number) =>
                      compose === 'max' ? `max(${dayRate}, ${night}) = ${composeOf(dayRate)}`
                      : compose === 'multiply' ? `${dayRate} × ${night} = ${composeOf(dayRate).toFixed(2)}`
                      : `${night} (replaces ${dayRate}x ${dayLabel})`;
                    const composeRuleLine =
                      compose === 'max' ? `→ effective_rate = max(dayTypeRate, ${night})`
                      : compose === 'multiply' ? `→ effective_rate = dayTypeRate × ${night}`
                      : `→ effective_rate = ${night}`;
                    const composeNarrative =
                      compose === 'max' ? 'night rate acts as a floor on the day-type rate'
                      : compose === 'multiply' ? 'night rate compounds with the day-type rate'
                      : 'night rate replaces the day-type rate';
                    const workday = otSettings.workdayRule.rate;
                    const weekend = otSettings.weekendRule.rate;
                    const work7  = (7 * composeOf(workday));
                    const wknd2  = (2 * composeOf(weekend));
                    return (
                      <>
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <p className="text-xs font-medium text-indigo-800 uppercase tracking-wide mb-2">How It Works</p>
                          <div className="tabular-nums text-xs space-y-1.5 text-indigo-900">
                            <p>if OT interval overlaps [{otSettings.nightRule.startTime}, {otSettings.nightRule.endTime})</p>
                            <p className="pl-4">{composeRuleLine} <span className="text-indigo-600">({composeNarrative})</span></p>
                            <p className="pl-4 text-indigo-600">otherwise effective_rate = dayTypeRate</p>
                          </div>
                          <p className="mt-3 text-[11px] text-indigo-800/80">
                            The window wraps past midnight when end ≤ start. Cross-date OT splits at midnight — each side picks its own day-type, and the composition rule above applies to whichever bucket overlaps the window.
                          </p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example: Night shift 22:00 → 05:00 (cross-date, 7h)</p>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Check-in</span><span className="font-medium">22:00 yesterday</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Check-out</span><span className="font-medium">05:00 today</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Day type (start date)</span><Badge className="bg-blue-100 text-blue-700 border-0">Weekday · {workday}x</Badge></div>
                            <div className="flex justify-between"><span className="text-gray-600">Fully in night window?</span><Badge className="bg-indigo-100 text-indigo-700 border-0">Yes · {night}x</Badge></div>
                            <div className="flex justify-between"><span className="text-gray-600">Effective rate</span><span className="font-medium">{composeOf(workday)}x <span className="text-gray-500">({composeFormula('weekday', workday)})</span></span></div>
                            <div className="border-t pt-2 flex justify-between bg-indigo-100 -mx-4 px-4 py-2 rounded">
                              <span className="font-medium text-indigo-800">OT pay</span>
                              <span className="font-semibold text-indigo-800">7h × {composeOf(workday)}x = {work7.toFixed(2)}h equivalent</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example: Saturday 23:00 → Sunday 01:00 (cross-date, 2h)</p>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Day type (Saturday start)</span><Badge className="bg-orange-100 text-orange-700 border-0">Weekend · {weekend}x</Badge></div>
                            <div className="flex justify-between"><span className="text-gray-600">In night window?</span><Badge className="bg-indigo-100 text-indigo-700 border-0">Yes · {night}x</Badge></div>
                            <div className="flex justify-between"><span className="text-gray-600">Effective rate</span><span className="font-medium">{composeOf(weekend)}x <span className="text-gray-500">({composeFormula('weekend', weekend)})</span></span></div>
                            <div className="border-t pt-2 flex justify-between bg-indigo-100 -mx-4 px-4 py-2 rounded">
                              <span className="font-medium text-indigo-800">OT pay</span>
                              <span className="font-semibold text-indigo-800">2h × {composeOf(weekend)}x = {wknd2.toFixed(2)}h equivalent</span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <div className="bg-white border rounded-lg p-4 text-xs leading-relaxed text-gray-600">
                    <p className="font-medium text-gray-700 mb-1.5">Cambodian Labour Law reference</p>
                    <p><strong>Art. 144</strong> — Night work is performed between 22:00 and 05:00.</p>
                    <p className="mt-1"><strong>Art. 162</strong> — Night work is paid at no less than 130% of the normal hourly wage. The composition mode above decides how that rate combines with the day-type multiplier — see the worked examples for the picked mode's behaviour.</p>
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
              {otSettings.nightRule.enabled && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border-2 border-indigo-300 bg-indigo-100 text-indigo-800 p-4">
                  <Moon className="h-4 w-4" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Night-work overlay</p>
                    <p className="text-xs opacity-75">
                      OT in [{otSettings.nightRule.startTime} → {otSettings.nightRule.endTime}) — {otSettings.nightRule.compose === 'max'
                        ? `max(dayType, ${otSettings.nightRule.rate}x)`
                        : otSettings.nightRule.compose === 'multiply'
                          ? `dayType × ${otSettings.nightRule.rate} (compound)`
                          : `${otSettings.nightRule.rate}x replaces the day-type rate`}.
                    </p>
                  </div>
                </div>
              )}
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
                        <Label>Department / Group / Team</Label>
                        <Select value={newDeptAssign.department} onValueChange={v => setNewDeptAssign({ ...newDeptAssign, department: v })}>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {/* "All" — applies the rule tenant-wide for the
                                Workday / Weekend / Holiday default rates. */}
                            <SelectItem value="__all__">All (every department, group, team)</SelectItem>
                            {(['department', 'group', 'team'] as const).flatMap(t => {
                              const bucket = deptList
                                .filter(d => ((d as { type?: string }).type ?? 'department') === t)
                                .sort((a, b) => a.name.localeCompare(b.name));
                              if (bucket.length === 0) return [];
                              const label = t === 'department' ? 'Departments'
                                : t === 'group' ? 'Groups' : 'Teams';
                              return [
                                <div key={`${t}-hdr`} className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">{label}</div>,
                                ...bucket.map(d => (
                                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                )),
                              ];
                            })}
                          </SelectContent>
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
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-blue-600" /><p className="font-medium text-sm text-blue-800">Workday</p></div>
                  <div className="text-2xl font-bold text-blue-700">{otSettings.workdayRule.rate}x</div>
                  <div className="text-xs text-blue-600 space-y-1"><p>After {otSettings.workdayRule.otStartAfter}</p><p>Min {otSettings.workdayRule.minimumOTMinutes}min / Max {otSettings.workdayRule.maxOTHours}h</p></div>
                  <div className="tabular-nums text-xs text-blue-900 bg-white rounded p-2">18:30 out → 1.5h × {otSettings.workdayRule.rate} = {(1.5 * otSettings.workdayRule.rate).toFixed(2)}h</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-600" /><p className="font-medium text-sm text-orange-800">Weekend</p></div>
                  <div className="text-2xl font-bold text-orange-700">{otSettings.weekendRule.rate}x</div>
                  <div className="text-xs text-orange-600 space-y-1"><p>{otSettings.weekendRule.countAllHoursAsOT ? 'All hours = OT' : 'After standard hours'}</p><p>Min {otSettings.weekendRule.minimumWorkMinutes}min required</p></div>
                  <div className="tabular-nums text-xs text-orange-900 bg-white rounded p-2">6h work → 6h × {otSettings.weekendRule.rate} = {(6 * otSettings.weekendRule.rate).toFixed(1)}h</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2"><PartyPopper className="h-4 w-4 text-red-600" /><p className="font-medium text-sm text-red-800">Holiday</p></div>
                  <div className="text-2xl font-bold text-red-700">{otSettings.holidayRule.rate}x</div>
                  <div className="text-xs text-red-600 space-y-1"><p>Highest priority rule</p><p>{otSettings.holidayRule.specialBonusEnabled ? `+ $${otSettings.holidayRule.specialBonusAmount} bonus` : 'No special bonus'}</p></div>
                  <div className="tabular-nums text-xs text-red-900 bg-white rounded p-2">5h work → 5h × {otSettings.holidayRule.rate} = {(5 * otSettings.holidayRule.rate).toFixed(1)}h</div>
                </div>
                {/* Night Work — when in window, the night rate replaces
                    the day-type rate (rather than max-ing on top of it).
                    Greys out when the toggle is off so HR can see it's
                    configured but inactive. */}
                <div className={`rounded-lg p-4 space-y-3 border ${otSettings.nightRule.enabled ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <Moon className={`h-4 w-4 ${otSettings.nightRule.enabled ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <p className={`font-medium text-sm ${otSettings.nightRule.enabled ? 'text-indigo-800' : 'text-gray-500'}`}>
                      Night Work
                    </p>
                    {!otSettings.nightRule.enabled && (
                      <Badge variant="outline" className="px-1 py-0 text-[10px] ml-auto">off</Badge>
                    )}
                  </div>
                  <div className={`text-2xl font-bold ${otSettings.nightRule.enabled ? 'text-indigo-700' : 'text-gray-500'}`}>
                    {otSettings.nightRule.rate}x
                  </div>
                  <div className={`text-xs space-y-1 ${otSettings.nightRule.enabled ? 'text-indigo-600' : 'text-gray-500'}`}>
                    <p>Window {otSettings.nightRule.startTime}–{otSettings.nightRule.endTime}</p>
                    <p>
                      {otSettings.nightRule.compose === 'max'
                        ? 'max(dayType, night) · cross-date OK'
                        : otSettings.nightRule.compose === 'multiply'
                          ? 'dayType × night · cross-date OK'
                          : 'Replaces day-type rate · cross-date OK'}
                    </p>
                  </div>
                  <div className={`tabular-nums text-xs bg-white rounded p-2 ${otSettings.nightRule.enabled ? 'text-indigo-900' : 'text-gray-500'}`}>
                    {(() => {
                      const w = otSettings.workdayRule.rate, n = otSettings.nightRule.rate;
                      const eff = otSettings.nightRule.compose === 'max' ? Math.max(w, n)
                        : otSettings.nightRule.compose === 'multiply' ? w * n
                        : n;
                      return `Fri 22:00 → Sat 05:00, 7h × ${eff} = ${(7 * eff).toFixed(1)}h`;
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ HOLIDAY TAB ═══════════════ */}
        {/* Embedded the rich Holiday view (clone, year filter, search,
            calendar modal) so the in-tab and standalone routes stay in
            sync — was previously a bare-bones table that diverged. */}
        <TabsContent value="holiday" className="space-y-6">
          <HolidayView embedded />
        </TabsContent>

        {/* ═══════════════ GENERAL TAB ═══════════════ */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Absent & Missing Punch Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium inline-flex items-center gap-1.5">
                    Auto-mark Absent
                    <HelpHint>Automatically mark employees with no check-in as absent.</HelpHint>
                  </p>
                  <Switch
                    checked={generalSettings.autoMarkAbsent}
                    onCheckedChange={v => setGeneralSettings({ ...generalSettings, autoMarkAbsent: v })}
                  />
                </div>

                {generalSettings.autoMarkAbsent && (
                  <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                    <Label className="text-sm inline-flex items-center gap-1.5">
                      Absent Deadline
                      <HelpHint>If no check-in by this time, mark as absent.</HelpHint>
                    </Label>
                    <Input
                      type="time"
                      value={generalSettings.absentDeadlineTime}
                      onChange={e => setGeneralSettings({ ...generalSettings, absentDeadlineTime: e.target.value })}
                      className="w-36 h-9"
                    />
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium inline-flex items-center gap-1.5">
                      Track Missing Check-out
                      <HelpHint>Flag employees who checked in but didn't check out.</HelpHint>
                    </p>
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
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium inline-flex items-center gap-1.5">
                    Notify Manager
                    <HelpHint>Send alerts to managers about team attendance issues.</HelpHint>
                  </p>
                  <Switch
                    checked={generalSettings.notifyManager}
                    onCheckedChange={v => setGeneralSettings({ ...generalSettings, notifyManager: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium inline-flex items-center gap-1.5">
                    Notify Employee
                    <HelpHint>Send reminders to employees about missing punches.</HelpHint>
                  </p>
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
                <p className="text-xs text-gray-500 mt-1">
                  Click a day to cycle through <strong className="text-green-700">Work</strong> → <strong className="text-amber-700">Half</strong> → <strong className="text-red-700">Weekend</strong>.
                  Half workdays are common at Cambodian banks and factories (typically Saturday) — the employee is present but with reduced expected hours.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const isWeekend = generalSettings.weekendDays.includes(day);
                    const isHalf    = generalSettings.halfDayDays.includes(day);
                    // 3-state cycle: work → half → weekend → work. A day
                    // can never be BOTH half and weekend, so the click
                    // handler always strips the day from the "wrong"
                    // list as part of its move.
                    const state: 'work' | 'half' | 'weekend' =
                      isWeekend ? 'weekend' : isHalf ? 'half' : 'work';
                    const cycle = () => {
                      const stripWeekend = generalSettings.weekendDays.filter(d => d !== day);
                      const stripHalf    = generalSettings.halfDayDays.filter(d => d !== day);
                      if (state === 'work') {
                        setGeneralSettings({
                          ...generalSettings,
                          weekendDays: stripWeekend,
                          halfDayDays: [...stripHalf, day],
                        });
                      } else if (state === 'half') {
                        setGeneralSettings({
                          ...generalSettings,
                          weekendDays: [...stripWeekend, day],
                          halfDayDays: stripHalf,
                        });
                      } else {
                        setGeneralSettings({
                          ...generalSettings,
                          weekendDays: stripWeekend,
                          halfDayDays: stripHalf,
                        });
                      }
                    };
                    const cls =
                      state === 'weekend' ? 'bg-red-100 text-red-700 border-2 border-red-300'
                      : state === 'half'    ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                      : 'bg-green-50 text-green-700 border-2 border-green-200';
                    const badge =
                      state === 'weekend' ? 'Weekend'
                      : state === 'half'    ? 'Half'
                      : 'Work';
                    return (
                      <button
                        key={day}
                        onClick={cycle}
                        title={`${day} — ${badge}. Click to change.`}
                        className={`flex flex-col items-center py-2.5 rounded-lg text-xs font-medium transition-colors ${cls}`}
                      >
                        <span>{day.slice(0, 3)}</span>
                        <span className="text-[10px] opacity-80 mt-0.5">{badge}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded bg-green-400" /> Work day
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded bg-amber-400" /> Half day
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
            <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              Grace minutes after IN
              {/* Dynamic hint — recomputes from draft so the tooltip
                  always reflects the in-flight value, not the saved
                  rule. Late-after time stays in the tooltip instead
                  of below the input to keep the row tight. */}
              <HelpHint>Late after {addGrace(draft.morningIn, draft.graceInMinutes)}.</HelpHint>
            </Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.graceInMinutes}
              onChange={e => setDraft({ ...draft, graceInMinutes: clamp(Number(e.target.value), 0, 60) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              Grace minutes before OUT
              <HelpHint>A check-out this many minutes early still counts as on-time.</HelpHint>
            </Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={draft.graceOutMinutes}
              onChange={e => setDraft({ ...draft, graceOutMinutes: clamp(Number(e.target.value), 0, 60) })}
            />
          </div>
        </div>

        {/* Half-day toggle (2-scan only) */}
        {draft.mode === 'two' && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-md border bg-gray-50">
            <p className="text-sm font-medium inline-flex items-center gap-1.5">
              Half-day leave counts as half-scan
              <HelpHint>
                When an employee has approved half-day leave (AM or PM), skip the absent half
                and only evaluate the half they worked.
              </HelpHint>
            </p>
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
        <div className="inline-flex items-center gap-1.5">
          <p className="font-medium text-sm">{title}</p>
          {/* Subtitle moved into the (i) hover hint — keeps each card
              to a single line so the two scan-mode tiles sit at the
              same height regardless of subtitle length. */}
          <HelpHint>{subtitle}</HelpHint>
        </div>
        {active && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
      </div>
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
      <span className="text-gray-400 tabular-nums">
        {session.actualIn ?? '— —'} / {session.actualOut ?? '— —'}
      </span>
    </span>
  );
}
