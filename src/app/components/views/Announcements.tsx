import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Megaphone, Send, RefreshCw, Plus, Loader2, AlertCircle,
  CheckCircle2, XCircle, MinusCircle, Search, Calendar, FileEdit, Hourglass, Info,
  PartyPopper, Newspaper, CalendarHeart, Inbox, ListChecks, Eye, UserCircle2, Sparkles,
} from 'lucide-react';
import { AnnouncementPlate } from '../common/AnnouncementPlate';
import { SearchablePicker } from '../common/SearchablePicker';

import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/announcements';
import * as employeesApi from '../../api/employees';
import * as customersApi from '../../api/customers';
import * as holidaysApi from '../../api/holidays';
import * as settingsApi from '../../api/settings';
import * as systemHolidaysApi from '../../api/systemHolidays';
import * as telegramApi from '../../api/telegram';
import * as hrTelegramApi from '../../api/hrTelegramBots';

/**
 * Announcements (V122). Admin / manager publishes a broadcast to
 * employees or customers (all or specific) with an optional Telegram
 * fan-out. The list shows delivery status; the detail dialog reads
 * per-recipient logs so the operator can see who got it and who
 * didn't (and why).
 */
export function Announcements() {
  const { canCreate, canView, isModuleAvailable } = useAuth();
  const canCreateAnnouncement = canCreate('announcements');
  const canViewAnnouncement   = canView('announcements');
  // Audience options are only meaningful when both the tenant catalog
  // includes the corresponding module AND the role can view it. A
  // tenant on a stripped-down install (no Employees module, or no
  // Customers / Sale module) shouldn't see those audience entries.
  const employeesAvailable = isModuleAvailable('employees') && canView('employees');
  const customersAvailable = isModuleAvailable('customer')  && canView('customer');

  const [rows, setRows]     = useState<api.Announcement[]>([]);
  const [loading, setLoading] = useState(false);

  // Create-dialog state — kept here rather than inside a child so
  // the form can be reset cleanly on every open without prop drilling.
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [title, setTitle]           = useState('');
  const [body, setBody]             = useState('');
  const [audienceType, setAudienceType] = useState<api.AudienceType>('ALL_EMPLOYEES');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [sendTelegram, setSendTelegram] = useState(true);
  const [pickerSearch, setPickerSearch] = useState('');
  /** Recipient checklist lives in a nested popup launched from the
   *  audience row — keeps the parent dialog compact. */
  const [recipientsPickerOpen, setRecipientsPickerOpen] = useState(false);
  // Publish-mode is now decided by which footer button the user
  // clicks (Save Draft / Schedule / Publish Now) — no upfront card
  // picker. The schedule date input is always visible but only
  // matters when the Schedule button is clicked.
  const [publishAtLocal, setPublishAtLocal] = useState(''); // <input type="datetime-local"> string
  /** Optional explicit expiry. Blank = default to publishAt + 1 day
   *  server-side. Useful for "this event runs all month — don't
   *  hide it after a day" cases. */
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  /** On/off gates for the two optional date inputs. Off (default)
   *  hides the input entirely; flipping on reveals the picker. The
   *  state lets a half-typed value survive a toggle-off→on without
   *  re-entry, but we still clear the value when the toggle settles
   *  to off at submit time so a stale draft doesn't pollute the
   *  payload. */
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [expiresEnabled, setExpiresEnabled]   = useState(false);
  const [holidayId, setHolidayId] = useState<string>('');
  const [holidays, setHolidays]   = useState<holidaysApi.Holiday[]>([]);
  /* V147 — delivery-format tab. Default 'simple' keeps the old layout
   *  unchanged for back-compat; switching to 'rich' surfaces the
   *  bilingual + facts + sig + stamp fields and the live plate
   *  preview. {@link richTemplate} is derived for the submit payload
   *  + dialog width so the rest of the form stays oblivious to which
   *  tab is active. */
  const [activeTab, setActiveTab] = useState<'simple' | 'rich'>('simple');
  const richTemplate = activeTab === 'rich';
  const [titleKm, setTitleKm]   = useState('');
  const [bodyKm, setBodyKm]     = useState('');
  const [signature, setSignature] = useState('');
  const [stamp, setStamp]       = useState('');
  /** Fixed-3 facts array; the plate's strip is visually a 3-column
   *  grid so a 4th would crowd the row. Empty cells stay in state so
   *  the user can fill any of the three. */
  const [facts, setFacts] = useState<api.FactRow[]>([
    { label: '', valueEn: '', valueKm: '' },
    { label: '', valueEn: '', valueKm: '' },
    { label: '', valueEn: '', valueKm: '' },
  ]);
  /** Ref points at the live-preview plate so html2canvas can capture
   *  it at submit time (Slice 4 will use this). */
  const plateRef = useRef<HTMLDivElement | null>(null);
  /** Company display name — read from settings/company once and reused
   *  as the plate brand. Falls back to a neutral label when the tenant
   *  hasn't filled in Settings → Company. Loaded lazily the first time
   *  the create dialog opens so we don't waste a request on a viewer
   *  who never composes an announcement. */
  const [companyName, setCompanyName] = useState<string>('');

  /** Patch one row of the facts strip — immutable update so React
   *  picks up the change and the preview re-renders. */
  const updateFact = (idx: number, patch: Partial<api.FactRow>) => {
    setFacts(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  };
  /** Confirmation gate for the broadcast modes. Set by Publish Now /
   *  Schedule; cleared on Confirm or Cancel. Draft skips the gate
   *  because it doesn't notify anyone. */
  const [pendingPublishMode, setPendingPublishMode] = useState<api.PublishMode | null>(null);
  /** V126 — category dropdown. Defaults to OTHERS for the everyday
   *  "miscellaneous notice" use case. */
  const [type, setType] = useState<api.AnnouncementType>('OTHERS');

  // Cache the roster + customer list once when the dialog opens —
  // both are bounded sets that don't need pagination at this scale.
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  /** Recipient ids that already have a linked Telegram chat. Drives
   *  the 📤 marker + "linked" tooltip on each picker row so the admin
   *  can see at a glance who'll actually receive the push vs who'll
   *  only see the in-app announcement. Soft-fails to empty on 403. */
  const [linkedEmployeeIds, setLinkedEmployeeIds] = useState<Set<string>>(new Set());
  const [linkedCustomerIds, setLinkedCustomerIds] = useState<Set<string>>(new Set());

  // Detail-dialog state.
  const [detail, setDetail] = useState<api.Announcement | null>(null);
  const [logs, setLogs]     = useState<api.TelegramLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // "Seen by" panel data — fetched alongside logs on detail open.
  const [readers, setReaders] = useState<api.AnnouncementReader[]>([]);
  const [readersLoading, setReadersLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.list(0, 50);
      setRows(res.content ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (canViewAnnouncement) void load(); }, [canViewAnnouncement]);

  // Pull recipient candidates lazily — only when the dialog opens AND
  // a SPECIFIC audience type is in play. ALL_* doesn't render the
  // picker, so we skip the fetch in that case.
  useEffect(() => {
    if (!createOpen) return;
    if (audienceType !== 'SPECIFIC_EMPLOYEES' && audienceType !== 'SPECIFIC_CUSTOMERS') return;
    setPickerLoading(true);
    (async () => {
      try {
        if (audienceType === 'SPECIFIC_EMPLOYEES') {
          // Roster + the linked-telegram side-fetch in parallel —
          // we need both to render rows with a Telegram marker.
          // Both soft-fail to [] so a missing permission on either
          // side doesn't break the picker.
          const [roster, linked] = await Promise.all([
            employeesApi.list({ size: 500 }),
            hrTelegramApi.listLinkedEmployees().catch(() => [] as hrTelegramApi.HrTelegramEmployee[]),
          ]);
          setEmployees(roster.content ?? []);
          setLinkedEmployeeIds(new Set(linked.map(l => l.employeeId)));
        } else {
          const [roster, linked] = await Promise.all([
            customersApi.list({ size: 500 }),
            telegramApi.listLinkedCustomers().catch(() => [] as telegramApi.TelegramCustomer[]),
          ]);
          setCustomers(roster.content ?? []);
          setLinkedCustomerIds(new Set(linked.map(l => l.customerId)));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load recipients');
      } finally {
        setPickerLoading(false);
      }
    })();
  }, [createOpen, audienceType]);

  // Load the company name once on mount — used by both the rich-
  // template live preview AND the detail dialog when an existing
  // rich-template row is opened. The endpoint has no perm gate so
  // every authenticated viewer can read it; failure falls through
  // to the "Internal Bulletin" plate fallback.
  useEffect(() => {
    if (!canViewAnnouncement) return;
    let cancelled = false;
    settingsApi.getCompanyInfo()
      .then(info => { if (!cancelled) setCompanyName(info.name ?? ''); })
      .catch(() => { /* fallback handled at render time */ });
    return () => { cancelled = true; };
  }, [canViewAnnouncement]);

  const openCreate = () => {
    setTitle('');
    setBody('');
    // Default to whichever audience the tenant actually has — falls
    // through to Customers when Employees isn't available, then to
    // the Employees default for the common case. If neither is
    // available the create button is hidden upstream (see the
    // canCreateAnnouncement gate on the page header).
    setAudienceType(employeesAvailable ? 'ALL_EMPLOYEES'
                   : customersAvailable ? 'ALL_CUSTOMERS'
                   : 'ALL_EMPLOYEES');
    setRecipientIds([]);
    setSendTelegram(true);
    // V147 — rich-template fields reset on every open so a stale
    // value from a previous compose doesn't bleed into the next one.
    setActiveTab('simple');
    setTitleKm('');
    setBodyKm('');
    setSignature('');
    setStamp('');
    setFacts([
      { label: '', valueEn: '', valueKm: '' },
      { label: '', valueEn: '', valueKm: '' },
      { label: '', valueEn: '', valueKm: '' },
    ]);
    setPickerSearch('');
    setPublishAtLocal('');
    setExpiresAtLocal('');
    setScheduleEnabled(false);
    setExpiresEnabled(false);
    setHolidayId('');
    setType('OTHERS');
    setCreateOpen(true);
    // Merge two sources so a fresh tenant — who hasn't copied any
    // system holidays yet — still gets a populated picker:
    //   1. Tenant's own public holidays (Settings → Holidays)
    //   2. The V124 system catalog (Super Admin maintained)
    // Dedupe by (date, name) so a holiday the tenant has already
    // copied doesn't appear twice. Both calls soft-fail to [] so a
    // 403 on either side doesn't break the picker.
    const today = new Date().toISOString().slice(0, 10);
    const year = new Date().getFullYear();
    Promise.all([
      holidaysApi.list({ year, type: 'public' }).catch(() => [] as holidaysApi.Holiday[]),
      systemHolidaysApi.tenantList(year).catch(() => [] as systemHolidaysApi.SystemHoliday[]),
    ]).then(([tenant, sys]) => {
      const tenantFuture = tenant.filter(h => h.date >= today);
      // System rows that the tenant doesn't already have. Coerce the
      // system row into the holidaysApi.Holiday shape so the picker
      // doesn't need to branch on source.
      const taken = new Set(tenantFuture.map(h => `${h.date}|${h.name.toLowerCase()}`));
      const sysFiltered: holidaysApi.Holiday[] = sys
        .filter(s => s.date >= today && !taken.has(`${s.date}|${s.name.toLowerCase()}`))
        .map(s => ({
          id: s.id, name: s.name, date: s.date, type: s.type,
          isPaid: s.isPaid, description: s.description, clonedFromId: null,
        }));
      const merged = [...tenantFuture, ...sysFiltered]
        .sort((a, b) => a.date.localeCompare(b.date));
      setHolidays(merged);
    });
  };

  /** Called by each footer button (Save Draft / Schedule / Publish
   *  Now). The mode the caller picks decides which validation the
   *  request goes through and which API payload we build. */
  const submit = async (mode: api.PublishMode) => {
    const t = title.trim();
    const b = body.trim();
    if (!t) { toast.error('Title is required'); return; }
    if (!b) { toast.error('Body is required'); return; }
    const isSpecific = audienceType === 'SPECIFIC_EMPLOYEES' || audienceType === 'SPECIFIC_CUSTOMERS';
    if (isSpecific && recipientIds.length === 0) {
      toast.error('Pick at least one recipient');
      return;
    }
    // Schedule mode requires publishAtLocal AND it must be in the
    // future (the server checks too, but failing fast here saves a
    // round-trip and gives a clearer toast).
    let publishAtIso: string | undefined;
    if (mode === 'schedule') {
      if (!publishAtLocal) { toast.error('Pick a date and time before scheduling.'); return; }
      const ts = new Date(publishAtLocal);
      if (Number.isNaN(ts.getTime())) { toast.error('Invalid schedule date/time'); return; }
      if (ts.getTime() <= Date.now()) { toast.error('Schedule must be in the future.'); return; }
      publishAtIso = ts.toISOString();
    }
    // Optional expiry — when set, must be after publishAt (or now()
    // for the immediate-publish path) so the row doesn't expire
    // before it goes live.
    let expiresAtIso: string | undefined;
    if (expiresAtLocal) {
      const ts = new Date(expiresAtLocal);
      if (Number.isNaN(ts.getTime())) { toast.error('Invalid expiry date/time'); return; }
      const lower = publishAtIso ? new Date(publishAtIso).getTime() : Date.now();
      if (ts.getTime() <= lower) { toast.error('Expiry must be after the publish time.'); return; }
      expiresAtIso = ts.toISOString();
    }
    setCreating(true);
    try {
      // V147 — when the rich-template toggle is on, capture the live
      // preview to a PNG via html2canvas so the bot can sendPhoto it.
      // Slice 4 wires the actual capture; we ship the field shape now
      // so the server-side accept path is exercised even before the
      // capture is hooked up. The string stays undefined when the
      // ref is empty (rare race) or the toggle is off.
      let imageDataUrl: string | undefined;
      if (richTemplate && plateRef.current) {
        try {
          const { default: html2canvas } = await import('html2canvas');
          const canvas = await html2canvas(plateRef.current, {
            scale: 2,           // retina-ish; the bot resizes on send anyway
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          });
          imageDataUrl = canvas.toDataURL('image/png');
        } catch (capErr) {
          // Non-fatal — the row still saves, just without the cached
          // PNG. The bot path falls back to plain-text delivery and
          // the in-app detail dialog renders the plate from fields.
          console.warn('[announcement] plate capture failed', capErr);
        }
      }

      await api.create({
        title: t,
        body: b,
        audienceType,
        recipientIds: isSpecific ? recipientIds : undefined,
        sendTelegram,
        publishMode: mode,
        publishAt: publishAtIso,
        expiresAt: expiresAtIso,
        holidayId: holidayId || undefined,
        type,
        // V147 — only send the rich fields when the toggle is on, so
        // the server's simple-row code path stays bit-identical for
        // legacy compositions.
        richTemplate,
        ...(richTemplate ? {
          titleKm:   titleKm.trim()   || undefined,
          bodyKm:    bodyKm.trim()    || undefined,
          signature: signature.trim() || undefined,
          stamp:     stamp.trim()     || undefined,
          // Drop completely-empty rows before sending; the server
          // also caps at 3, but pruning here keeps the payload tidy.
          facts: facts
            .filter(f => f.label || f.valueEn || f.valueKm)
            .map(f => ({ label: f.label, valueEn: f.valueEn, valueKm: f.valueKm })),
          imageDataUrl,
        } : {}),
      });
      const msg = mode === 'draft'
        ? 'Saved as draft'
        : mode === 'schedule'
          ? 'Scheduled'
          : sendTelegram ? 'Published — Telegram fan-out started' : 'Published';
      toast.success(msg);
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCreating(false);
    }
  };

  /** When the operator picks a Holiday from the search dropdown,
   *  overwrite the title with "<friendly date> · <holiday name>" so
   *  the in-app list reads cleanly without HR having to type. The
   *  picker is now embedded in the Title row (V147 redesign), so a
   *  selection is an explicit "use this holiday as my title" action
   *  — we replace the typed value rather than respecting it. Type
   *  stays HOLIDAY (this code path only runs from the holiday-picker
   *  which is only mounted under Type=HOLIDAY). */
  const onPickHoliday = (id: string) => {
    setHolidayId(id);
    if (!id) return;
    const h = holidays.find(x => x.id === id);
    if (!h) return;
    const friendlyDate = new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    setTitle(`${friendlyDate} · ${h.name}`);
  };

  const openDetail = async (a: api.Announcement) => {
    setDetail(a);
    setLogs([]);
    setReaders([]);
    // Two parallel side-fetches: telegram logs (only when applicable)
    // and the "Seen by" reader list. Each soft-fails independently
    // so a broken half doesn't blank the dialog.
    setReadersLoading(true);
    api.getReaders(a.id)
      .then(setReaders)
      .catch(() => setReaders([]))
      .finally(() => setReadersLoading(false));
    if (!a.sendTelegram) return;
    setLogsLoading(true);
    try {
      setLogs(await api.getLogs(a.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  // Toggle a recipient on/off in the SPECIFIC picker. Map-style
  // toggle so the list doesn't re-render the whole picker on each click.
  const toggleRecipient = (id: string) => {
    setRecipientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const pickerOptions = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (audienceType === 'SPECIFIC_EMPLOYEES') {
      // Sort connected-to-Telegram rows to the top so the picker
      // surfaces them first — admins usually want to send to people
      // who'll actually receive the push. Stable secondary sort by
      // name keeps it predictable inside each group.
      return employees
        .filter(e => !q
          || e.name.toLowerCase().includes(q)
          || (e.empNo?.toLowerCase().includes(q) ?? false)
          || (e.contactNumber?.toLowerCase().includes(q) ?? false)
          || (e.email?.toLowerCase().includes(q) ?? false))
        .map(e => ({
          id: e.id,
          label: e.name,
          subtitle: [e.empNo, e.contactNumber, e.email].filter(Boolean).join(' · '),
          linked: linkedEmployeeIds.has(e.id),
        }))
        .sort((a, b) => {
          if (a.linked !== b.linked) return a.linked ? -1 : 1;
          return a.label.localeCompare(b.label);
        });
    }
    if (audienceType === 'SPECIFIC_CUSTOMERS') {
      return customers
        .filter(c => !q
          || c.name.toLowerCase().includes(q)
          || (c.phone?.toLowerCase().includes(q) ?? false)
          || (c.email?.toLowerCase().includes(q) ?? false))
        .map(c => ({
          id: c.id,
          label: c.name,
          subtitle: [c.phone, c.email].filter(Boolean).join(' · '),
          linked: linkedCustomerIds.has(c.id),
        }))
        .sort((a, b) => {
          if (a.linked !== b.linked) return a.linked ? -1 : 1;
          return a.label.localeCompare(b.label);
        });
    }
    return [];
  }, [audienceType, employees, customers, pickerSearch, linkedEmployeeIds, linkedCustomerIds]);

  /** Count linked recipients to summarise on the picker header —
   *  tells the admin "of the N you're picking from, M are reachable
   *  via Telegram." */
  const linkedCountInPicker = pickerOptions.filter(o => o.linked).length;

  if (!canViewAnnouncement) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Announcements</h1>
        <Card><CardContent className="p-6 text-sm text-gray-500">
          You don't have permission to view announcements.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-blue-50 p-2 rounded-md">
            <Megaphone className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              Announcements
              {/* Subtitle moved into a tooltip so the header stays
                  compact for return visits — same pattern used on
                  System Holidays, Customer/HR Telegram dialogs, etc. */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" tabIndex={-1}
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="About announcements">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    Broadcast a message to employees or customers. When
                    Telegram is on, every linked recipient also gets a
                    push to their bot chat.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreateAnnouncement && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> New Announcement
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[160px]">Audience</TableHead>
                <TableHead className="w-[150px]">Telegram</TableHead>
                <TableHead className="w-[160px]">Publish</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                  No announcements yet. {canCreateAnnouncement && <>Click <strong>New Announcement</strong> to publish the first one.</>}
                </TableCell></TableRow>
              )}
              {rows.map(a => (
                <TableRow key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => void openDetail(a)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={a.type} />
                      <span>{a.title}</span>
                      {/* "Seen by N" chip — quick read-rate signal
                          inline next to the title so the admin
                          doesn't have to open detail to gauge reach. */}
                      {(a.readCount ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px] text-gray-600 gap-1">
                          <Eye className="h-3 w-3" />
                          {a.readCount}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate max-w-md mt-0.5">{a.body}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell><AudienceBadge type={a.audienceType} /></TableCell>
                  <TableCell><TelegramStatusBadge status={a.telegramSentStatus} sendTelegram={a.sendTelegram} /></TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {a.publishAt
                      ? new Date(a.publishAt).toLocaleString()
                      : <span className="text-gray-400 italic">draft</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); void openDetail(a); }}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ----- Create dialog ----- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* Capped at 90vh with an internal scroll region so the form
            doesn't bleed off short laptops or split monitors. The
            header + footer stay pinned; only the middle scrolls. */}
        <DialogContent
          className={`max-h-[90vh] flex flex-col p-0 gap-0 ${
            // V147 — widen when the rich template's live preview is
            // mounted so the editor + plate sit side-by-side on lg+
            // without crowding either column.
            richTemplate ? 'sm:max-w-5xl' : 'sm:max-w-xl'
          }`}
        >
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-600" />
              New Announcement
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" tabIndex={-1}
                      className="text-gray-400 hover:text-gray-600" aria-label="About announcements">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm">
                    The body shows on the in-app list. When Telegram is on,
                    every linked recipient also gets a chat push.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
            {/* DialogDescription required by Radix for a11y but
                hidden — the same copy lives in the tooltip above. */}
            <DialogDescription className="sr-only">
              The body shows on the in-app list. When Telegram is on, every
              linked recipient also gets a chat push.
            </DialogDescription>
          </DialogHeader>

          {/* V147 — two delivery formats live behind tabs. Both share
              the same Title / Message / Type / Audience / Schedule /
              Telegram inputs, so a compose started on one tab carries
              over to the other; only the extras + preview at the
              bottom toggle. */}
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'simple' | 'rich')}>
            <div className="px-6 pt-3 border-b bg-gray-50/60">
              <TabsList className="bg-transparent p-0 h-auto gap-1">
                <TabsTrigger
                  value="simple"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-3 py-1.5 text-sm"
                >
                  Simple
                </TabsTrigger>
                <TabsTrigger
                  value="rich"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-3 py-1.5 text-sm flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                  Rich Bulletin
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Type + Broadcast-to are the first decision the admin
                makes — they shape every downstream field (holiday
                picker appears on Type=Holiday, recipient checklist
                appears on Broadcast=SPECIFIC_*). Lifted to the top so
                the rest of the form reflects an already-made choice
                rather than the operator scrolling back up to change it. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as api.AnnouncementType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOLIDAY">🎉 Holiday</SelectItem>
                    <SelectItem value="NEWS">📰 News</SelectItem>
                    <SelectItem value="EVENTS">🎪 Events</SelectItem>
                    <SelectItem value="OTHERS">📥 Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Broadcast to:</Label>
                <Select value={audienceType} onValueChange={(v) => setAudienceType(v as api.AudienceType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Audience entries gated on module availability —
                        keeps a stock-only or customer-only tenant from
                        seeing "All Employees" they can't address. */}
                    {employeesAvailable && (
                      <SelectItem value="ALL_EMPLOYEES">All Employees</SelectItem>
                    )}
                    {customersAvailable && (
                      <SelectItem value="ALL_CUSTOMERS">All Customers</SelectItem>
                    )}
                    {employeesAvailable && (
                      <SelectItem value="SPECIFIC_EMPLOYEES">Pick Employees…</SelectItem>
                    )}
                    {customersAvailable && (
                      <SelectItem value="SPECIFIC_CUSTOMERS">Pick Customers…</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title + Message. On the Rich Bulletin tab the inputs
                go bilingual — a side-by-side KH | EN pair under a
                single "Title (KH/EN)" label so the admin types both
                languages together instead of jumping between sections.
                When Type=HOLIDAY, a searchable holiday picker sits
                next to the title input — same UX as the Invoice
                Customer picker. Pick = overwrite title with the
                holiday name; otherwise the typed value stands. */}
            {richTemplate ? (
              <>
                {/* Title — single input. Title KM column was merged
                    away; admins type in one box and the plate uses
                    that one string. Message stays bilingual since
                    body copy benefits from a dedicated Khmer pane
                    where the plate's KH-line block of the plate's
                    lede actually renders side-by-side. */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <div className="flex gap-2">
                    <Input
                      value={title}
                      onChange={e => { setTitle(e.target.value); setHolidayId(''); }}
                      placeholder={type === 'HOLIDAY' ? 'Type a title or pick a holiday →' : 'Holiday Notice'}
                    />
                    {type === 'HOLIDAY' && holidays.length > 0 && (
                      <HolidayQuickPicker
                        holidays={holidays}
                        value={holidayId}
                        onPick={onPickHoliday}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  {/* Side-by-side bilingual lede so the plate's
                      two-column body layout (KM | EN) is mirrored in
                      the editor — admin sees the same column shape
                      they're filling. */}
                  <div className="grid grid-cols-2 gap-2">
                    <Textarea
                      rows={4}
                      value={bodyKm}
                      onChange={e => setBodyKm(e.target.value)}
                      placeholder="សារខ្មែរ…"
                      className="km-input"
                    />
                    <Textarea
                      rows={4}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      placeholder="English message"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <div className="flex gap-2">
                    <Input
                      value={title}
                      onChange={e => { setTitle(e.target.value); setHolidayId(''); }}
                      placeholder={type === 'HOLIDAY' ? 'Type a title or pick a holiday →' : 'Holiday Notice'}
                    />
                    {type === 'HOLIDAY' && holidays.length > 0 && (
                      <HolidayQuickPicker
                        holidays={holidays}
                        value={holidayId}
                        onPick={onPickHoliday}
                      />
                    )}
                  </div>
                  {type === 'HOLIDAY' && holidays.length === 0 && (
                    <div className="text-[11px] text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                      No upcoming public holidays found. Add them in <strong>Settings → Holidays</strong>{' '}
                      with type <span className="font-mono">public</span> and they'll appear in the picker.
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)}
                    placeholder="Office closed tomorrow." />
                </div>
              </>
            )}

            {/* Compact recipients summary + open-picker trigger.
                Full checklist lives in a nested dialog so the parent
                stays short. The summary line also doubles as a "you
                need to pick someone" reminder when count is 0. */}
            {(audienceType === 'SPECIFIC_EMPLOYEES' || audienceType === 'SPECIFIC_CUSTOMERS') && (
              <div className="space-y-1.5">
                <Label className="text-xs">Recipients</Label>
                <div className="flex items-center justify-between border rounded-md px-3 py-2 gap-2">
                  <div className="text-sm">
                    {recipientIds.length === 0 ? (
                      <span className="text-amber-700">No recipients picked yet.</span>
                    ) : (
                      <span><strong>{recipientIds.length}</strong> {audienceType === 'SPECIFIC_EMPLOYEES' ? 'employee' : 'customer'}{recipientIds.length === 1 ? '' : 's'} selected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {recipientIds.length > 0 && (
                      <button type="button" className="text-[11px] text-blue-600 hover:underline"
                        onClick={() => setRecipientIds([])}>
                        Clear
                      </button>
                    )}
                    <Button size="sm" variant="outline" className="h-7"
                      onClick={() => { setPickerSearch(''); setRecipientsPickerOpen(true); }}>
                      <ListChecks className="h-3.5 w-3.5 mr-1" />
                      {recipientIds.length === 0 ? 'Pick' : 'Edit'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Optional schedule + expiry — both date/time inputs in
                one row to save vertical space. Schedule is only used
                when the Schedule button is clicked; Expiry overrides
                the default "1 day after publish" hide window for both
                "Publish now" and "Schedule" paths. */}
            {/* Schedule + Expires now live behind on/off toggles so
                the form stays compact when the admin just wants
                "publish now / auto-expire". Switching off clears the
                stored value so a stale draft doesn't get sent. The
                datetime picker only mounts when the toggle is on. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-gray-500" />
                    Schedule for
                  </Label>
                  <Switch
                    checked={scheduleEnabled}
                    onCheckedChange={(on) => {
                      setScheduleEnabled(on);
                      if (!on) setPublishAtLocal('');
                    }}
                  />
                </div>
                {scheduleEnabled && (
                  <>
                    <Input type="datetime-local" value={publishAtLocal}
                      onChange={e => setPublishAtLocal(e.target.value)} className="h-9 text-sm" />
                    <div className="text-[11px] text-gray-500">
                      Required only for the <strong>Schedule</strong> button.
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Hourglass className="h-3.5 w-3.5 text-gray-500" />
                    Expires on
                  </Label>
                  <Switch
                    checked={expiresEnabled}
                    onCheckedChange={(on) => {
                      setExpiresEnabled(on);
                      if (!on) setExpiresAtLocal('');
                    }}
                  />
                </div>
                {expiresEnabled && (
                  <>
                    <Input type="datetime-local" value={expiresAtLocal}
                      onChange={e => setExpiresAtLocal(e.target.value)} className="h-9 text-sm" />
                    <div className="text-[11px] text-gray-500">
                      Blank = auto-expire 1 day after publish.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Linked Holiday — merged into the Title row above. The
                Type=HOLIDAY path embeds a searchable picker next to
                the Title input (V148 redesign), so this standalone
                block is no longer needed. holidayId state still
                drives the picker + the create payload. */}

            {/* V147 — rich-template extras. Shown only when the
                "Rich Bulletin" tab at the top of the dialog is
                active. The wrapping div carries the panel styling
                (subtle background, border) so the section reads as
                a contiguous block under the basic fields. */}
            {richTemplate && (
              <div className="border rounded-md bg-gradient-to-br from-blue-50/30 to-purple-50/20">
                <div className="px-3 py-2 border-b">
                  <div className="text-[11px] text-gray-500">
                    Bilingual title + body, 3 facts, signature &amp; stamp. Telegram receives the rendered plate as an image.
                  </div>
                </div>
                <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Editor column — Title (KH/EN) and Message (KH/EN)
                      now live at the top of the form (above this
                      section) so the admin only types each one once.
                      Kicker was dropped — the type code in the
                      header strip already serves the same "what
                      kind of notice is this" cue. */}
                  <div className="space-y-3">
                    {/* Facts strip — 3 fixed COLUMNS, each a vertical
                        stack of (label / EN value / KM value). The
                        editor layout mirrors how the plate renders
                        the strip on the right, so an admin sees
                        column 1's inputs sit directly under the
                        column-1 cell of the preview. Positional
                        placeholders (First / Middle / Last) reinforce
                        the column mapping. */}
                    <div className="space-y-1">
                      <Label className="text-xs">Facts (up to 3)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {facts.map((f, idx) => {
                          const pos = idx === 0 ? 'First' : idx === 1 ? 'Middle' : 'Last';
                          return (
                            <div key={idx} className="space-y-1.5 rounded-md border bg-white/70 p-2">
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                                {pos}
                              </div>
                              <Input
                                className="h-8 text-xs"
                                value={f.label}
                                onChange={e => updateFact(idx, { label: e.target.value })}
                                placeholder="Label"
                                maxLength={64}
                              />
                              <Input
                                className="h-8 text-xs"
                                value={f.valueEn}
                                onChange={e => updateFact(idx, { valueEn: e.target.value })}
                                placeholder="English"
                                maxLength={128}
                              />
                              <Input
                                className="h-8 text-xs km-input"
                                value={f.valueKm}
                                onChange={e => updateFact(idx, { valueKm: e.target.value })}
                                placeholder="ខ្មែរ"
                                maxLength={128}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Signature</Label>
                        <Input
                          value={signature} onChange={e => setSignature(e.target.value)}
                          placeholder="HR Department · Issued by …"
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Stamp</Label>
                        <Input
                          value={stamp} onChange={e => setStamp(e.target.value)}
                          placeholder={defaultStampForType(type)}
                          maxLength={48}
                        />
                        <p className="text-[10px] text-gray-400">
                          Blank → defaults to <span className="font-mono">{defaultStampForType(type)}</span> for this type.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Preview column. The plate ref is what Slice 4's
                      html2canvas reads at submit — keep it mounted
                      whenever the rich toggle is on so the capture
                      always sees the latest rendering. */}
                  <div className="lg:sticky lg:top-2 self-start">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1 font-mono">
                      Live preview
                    </div>
                    <AnnouncementPlate
                      ref={plateRef}
                      type={type}
                      bulletinNo={'YYYY·NN'}
                      // Preview the date the row will publish at —
                      // the scheduled time when the Schedule toggle is on,
                      // otherwise today (matches the 'Publish Now' path).
                      publishDate={scheduleEnabled && publishAtLocal ? new Date(publishAtLocal) : new Date()}
                      companyName={companyName}
                      titleEn={title || 'English Title'}
                      titleKm={titleKm}
                      bodyEn={body || 'English body preview…'}
                      bodyKm={bodyKm}
                      facts={facts}
                      signature={signature}
                      stamp={stamp.trim() || defaultStampForType(type)}
                    />
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      This preview is what Telegram receives as an image.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer combines two concerns: the Telegram fan-out
              switch on the left and the publish-mode buttons on the
              right. Putting the Telegram switch alongside the
              actions makes the cause-and-effect obvious — flipping
              it changes what Publish Now / Schedule will actually
              do, no separate row to scan. */}
          <DialogFooter className="px-6 py-3 border-t shrink-0 sm:justify-between gap-3">
            {/* Switch + Telegram brand mark only — no label text.
                Hover/long-press surfaces the full intent via the
                title tooltip, and the aria-label keeps screen readers
                informed. Inline SVG (not the lucide Send paper plane)
                so the glyph reads unambiguously as Telegram, not a
                generic "send" action. */}
            <label
              className="flex items-center gap-2 cursor-pointer select-none"
              title="Send via Telegram — push to every recipient whose chat is linked."
            >
              <Switch
                checked={sendTelegram}
                onCheckedChange={setSendTelegram}
                aria-label="Send via Telegram"
              />
              <svg viewBox="0 0 240 240" className="h-5 w-5" aria-hidden="true">
                <circle cx="120" cy="120" r="120" fill="#229ED9" />
                <path
                  d="M180 70L155 175c-2 9-7 11-14 7l-39-29-19 18c-2 2-4 4-8 4l3-42 76-69c3-3-1-5-5-3l-94 59-40-13c-9-3-9-9 2-13l158-61c7-3 14 2 11 17z"
                  fill="#fff"
                />
              </svg>
            </label>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => void submit('draft')} disabled={creating}>
                <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                Draft
              </Button>
              <Button variant="outline" onClick={() => setPendingPublishMode('schedule')}
                disabled={creating || !publishAtLocal}>
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Schedule
              </Button>
              <Button onClick={() => setPendingPublishMode('now')} disabled={creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Publish
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Recipients picker (nested popup) -----
          Launched from the compact summary in the create dialog when
          audience is SPECIFIC_*. Tap-to-toggle list with live search;
          selection persists when the popup closes since we're
          mutating the parent's recipientIds state directly. */}
      <Dialog open={recipientsPickerOpen} onOpenChange={setRecipientsPickerOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <ListChecks className="h-4 w-4 text-blue-600" />
              Pick {audienceType === 'SPECIFIC_EMPLOYEES' ? 'Employees' : 'Customers'}
              <Badge variant="outline" className="text-[11px]">
                {recipientIds.length} selected
              </Badge>
              {/* Surface the "of N, M are reachable via Telegram"
                  signal up front so the operator knows what fraction
                  of their picks will actually get the push. */}
              {linkedCountInPicker > 0 && (
                <Badge className="text-[11px] bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                  <Send className="h-3 w-3" />
                  {linkedCountInPicker} on Telegram
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Tick the recipients to include in this announcement.
              Green rows are connected to Telegram and will receive the chat push.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-3 border-b shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                placeholder={audienceType === 'SPECIFIC_EMPLOYEES'
                  ? 'Search name, empNo, phone…'
                  : 'Search name, phone, email…'}
                className="pl-7 h-8 text-sm" autoFocus />
            </div>
            {recipientIds.length > 0 && (
              <button type="button" className="text-[11px] text-blue-600 hover:underline"
                onClick={() => setRecipientIds([])}>
                Clear all
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 divide-y">
            {pickerLoading && (
              <div className="p-6 text-center text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> Loading…
              </div>
            )}
            {!pickerLoading && pickerOptions.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-500">No matches.</div>
            )}
            {!pickerLoading && pickerOptions.map(opt => (
              <label key={opt.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer ${
                  opt.linked ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-gray-50'
                }`}>
                <input type="checkbox" checked={recipientIds.includes(opt.id)}
                  onChange={() => toggleRecipient(opt.id)} className="h-3.5 w-3.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm flex items-center gap-1.5">
                    <span className={opt.linked ? 'text-emerald-800 font-medium' : ''}>{opt.label}</span>
                    {opt.linked && (
                      <span title="Telegram connected"
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 rounded px-1 py-0.5">
                        <Send className="h-2.5 w-2.5" />
                        Telegram
                      </span>
                    )}
                  </div>
                  {opt.subtitle && (
                    <div className="text-[11px] text-gray-500 truncate">{opt.subtitle}</div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <DialogFooter className="px-6 py-3 border-t shrink-0">
            <Button onClick={() => setRecipientsPickerOpen(false)}>
              Done ({recipientIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Detail dialog ----- */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-600" />
              {detail?.title}
            </DialogTitle>
            <DialogDescription>
              {detail && <>
                Published {new Date(detail.createdAt).toLocaleString()} ·{' '}
                <TypeBadge type={detail.type} /> ·{' '}
                <AudienceBadge type={detail.audienceType} />
              </>}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
              {/* V147 — when rich-template is on, the detail body
                  renders as the bulletin plate using the same
                  component the create-form previewed with. Falls
                  back to the legacy plain-text card otherwise so
                  older simple rows look unchanged. */}
              {detail.richTemplate ? (
                <div className="flex justify-center">
                  <AnnouncementPlate
                    type={detail.type}
                    bulletinNo={detail.bulletinNo}
                    // Prefer the row's actual publishAt (scheduled or
                    // immediate publish stamp) and fall back to
                    // createdAt for legacy rows that never set it.
                    publishDate={detail.publishAt ?? detail.createdAt}
                    companyName={companyName}
                    titleEn={detail.title}
                    titleKm={detail.titleKm}
                    bodyEn={detail.body}
                    bodyKm={detail.bodyKm}
                    facts={parseFactsJson(detail.factsJson)}
                    signature={detail.signature}
                    stamp={detail.stamp}
                  />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-md p-3 text-sm whitespace-pre-wrap">{detail.body}</div>
              )}

              {/* "Seen by" — distinct from Telegram delivery: counts
                  in-app reads (anyone who clicked the notification
                  bell row), regardless of whether they also got the
                  Telegram push. Best-practice read-rate metric. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-gray-500" /> Seen by
                  </Label>
                  <Badge variant="outline" className="text-[11px]">
                    {detail.readCount ?? 0} {(detail.readCount ?? 0) === 1 ? 'person' : 'people'}
                  </Badge>
                </div>
                {(detail.readCount ?? 0) === 0 ? (
                  <div className="text-xs text-gray-500 italic px-3 py-2">
                    No one has opened it yet.
                  </div>
                ) : (
                  <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                    {readersLoading && (
                      <div className="p-3 text-center text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> Loading…
                      </div>
                    )}
                    {!readersLoading && readers.map(r => (
                      <div key={r.userId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <UserCircle2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{r.name}</div>
                          {r.email && r.email !== r.name && (
                            <div className="text-[10px] text-gray-500 truncate">{r.email}</div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 whitespace-nowrap">
                          {new Date(r.readAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.sendTelegram ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Telegram delivery</Label>
                    <TelegramStatusBadge status={detail.telegramSentStatus} sendTelegram={detail.sendTelegram} />
                  </div>
                  <div className="border rounded-md max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recipient</TableHead>
                          <TableHead className="w-[110px]">Status</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsLoading && (
                          <TableRow><TableCell colSpan={3} className="text-center text-xs text-gray-500 py-4">Loading…</TableCell></TableRow>
                        )}
                        {!logsLoading && logs.length === 0 && (
                          <TableRow><TableCell colSpan={3} className="text-center text-xs text-gray-500 py-4">No deliveries yet — fan-out may still be in progress.</TableCell></TableRow>
                        )}
                        {logs.map(l => (
                          <TableRow key={l.id}>
                            <TableCell className="text-xs">
                              {/* Name + phone resolved server-side
                                  (V126+ enrichment). Fall back to the
                                  type + UUID slice if the source row
                                  is gone — keeps the audit trail
                                  readable even after deletes. */}
                              <div className="text-sm font-medium text-gray-900">
                                {l.recipientName ?? `${l.recipientType.toLowerCase()} · ${l.recipientId.slice(0, 8)}`}
                              </div>
                              <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-[9px] py-0 px-1 capitalize">
                                  {l.recipientType.toLowerCase()}
                                </Badge>
                                {l.recipientContact && <span>📞 {l.recipientContact}</span>}
                                {l.telegramChatId !== null && (
                                  <span className="text-gray-400">chat {l.telegramChatId}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {l.status === 'SENT' && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Sent</Badge>}
                              {l.status === 'FAILED' && <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>}
                              {l.status === 'NOT_LINKED' && <Badge variant="outline" className="text-gray-500">Not linked</Badge>}
                            </TableCell>
                            <TableCell className="text-xs text-gray-600 max-w-[260px] truncate" title={l.errorMessage ?? ''}>
                              {l.errorMessage ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 flex items-center gap-1.5">
                  <MinusCircle className="h-3.5 w-3.5" /> Telegram delivery was not requested.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="px-6 py-3 border-t shrink-0">
            <Button onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish / Schedule confirmation. Broadcasts are non-reversible
          (Telegram pushes hit recipients' phones instantly, in-app
          notifications are persisted), so we gate both modes behind an
          explicit confirm. Draft skips this — nothing leaves the server. */}
      <AlertDialog
        open={pendingPublishMode !== null}
        onOpenChange={(o) => !o && setPendingPublishMode(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingPublishMode === 'now' ? 'Publish this announcement?' : 'Schedule this announcement?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {pendingPublishMode === 'now'
                    ? 'The announcement will go out to recipients immediately.'
                    : 'The announcement will be queued and published at the time you picked.'}
                  {sendTelegram && ' A Telegram push will be sent to every recipient whose chat is linked.'}
                </p>
                <ul className="text-xs text-gray-600 space-y-1 pt-1">
                  <li><span className="font-medium text-gray-800">Title:</span> {title.trim() || <span className="italic text-gray-400">(empty)</span>}</li>
                  <li><span className="font-medium text-gray-800">Audience:</span> {audienceLabel(audienceType, recipientIds.length)}</li>
                  {pendingPublishMode === 'schedule' && publishAtLocal && (
                    <li><span className="font-medium text-gray-800">Scheduled for:</span> {new Date(publishAtLocal).toLocaleString()}</li>
                  )}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const mode = pendingPublishMode;
                setPendingPublishMode(null);
                if (mode) void submit(mode);
              }}
              disabled={creating}
            >
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {pendingPublishMode === 'now' ? 'Publish' : 'Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Parse the server's factsJson string into the FactRow array the
 *  plate component consumes. Returns an empty array on any parse
 *  error so a stored-malformed-blob can't crash the detail dialog. */
/** Compact search-dropdown for the Type=HOLIDAY title row. Wraps
 *  SearchablePicker — same UX as the Invoice page's Customer picker
 *  — and adapts the holidays list to PickerOption shape. The trigger
 *  is intentionally narrow (icon + caret) so it sits next to the
 *  Title input without dominating the row. */
function HolidayQuickPicker({
  holidays, value, onPick,
}: {
  holidays: holidaysApi.Holiday[];
  value: string;
  onPick: (id: string) => void;
}) {
  // Pre-build the option list — labels show the holiday name, the
  // secondary line carries the date so an admin can pick the right
  // "Khmer New Year" out of multiple years.
  const options = holidays.map(h => ({
    value: h.id,
    label: h.name,
    secondary: h.date,
    searchKey: `${h.name} ${h.date}`,
  }));
  return (
    <div className="w-44 shrink-0">
      <SearchablePicker
        value={value}
        onChange={onPick}
        placeholder="Pick holiday"
        searchPlaceholder="Search holidays…"
        emptyLabel="— none —"
        options={options}
      />
    </div>
  );
}

function parseFactsJson(raw: string | null | undefined): api.FactRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 3).map(r => ({
      label:   String(r?.label ?? ''),
      valueEn: String(r?.valueEn ?? ''),
      valueKm: String(r?.valueKm ?? ''),
    }));
  } catch {
    return [];
  }
}

/** Type-derived stamp default. Mirrors the server-side fallback in
 *  AnnouncementService.defaultStampFor — used by the form's hint
 *  text + the live-preview when the admin leaves the stamp blank. */
function defaultStampForType(t: api.AnnouncementType): string {
  switch (t) {
    case 'HOLIDAY': return 'Official';
    case 'EVENTS':  return 'Confirmed';
    case 'NEWS':    return 'Published';
    default:        return 'Notice';
  }
}

/** Short summary of who'll receive the announcement, shown on the
 *  confirmation step. Kept local to this file because nowhere else
 *  surfaces the same wording. */
function audienceLabel(type: api.AudienceType, count: number): string {
  switch (type) {
    case 'ALL_EMPLOYEES':       return 'All employees';
    case 'ALL_CUSTOMERS':       return 'All customers';
    case 'SPECIFIC_EMPLOYEES':  return `${count} selected employee${count === 1 ? '' : 's'}`;
    case 'SPECIFIC_CUSTOMERS':  return `${count} selected customer${count === 1 ? '' : 's'}`;
    default:                    return String(type);
  }
}

/* ----- helpers ----- */

function StatusBadge({ status }: { status: api.LifecycleStatus }) {
  switch (status) {
    case 'DRAFT':     return <Badge variant="outline" className="text-gray-500 gap-1"><FileEdit className="h-3 w-3" />Draft</Badge>;
    case 'SCHEDULED': return <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1"><Calendar className="h-3 w-3" />Scheduled</Badge>;
    case 'PUBLISHED': return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" />Published</Badge>;
    case 'EXPIRED':   return <Badge className="bg-gray-100 text-gray-600 border-gray-200 gap-1"><Hourglass className="h-3 w-3" />Expired</Badge>;
  }
}

function AudienceBadge({ type }: { type: api.AudienceType }) {
  const map: Record<api.AudienceType, { label: string; cls: string }> = {
    ALL_EMPLOYEES:       { label: 'All Employees',    cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    ALL_CUSTOMERS:       { label: 'All Customers',    cls: 'bg-sky-100 text-sky-700 border-sky-200' },
    SPECIFIC_EMPLOYEES:  { label: 'Some Employees',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    SPECIFIC_CUSTOMERS:  { label: 'Some Customers',   cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  };
  const m = map[type];
  return <Badge className={`gap-1 ${m.cls}`}>{m.label}</Badge>;
}

function TelegramStatusBadge({ status, sendTelegram }: { status: api.TelegramSentStatus; sendTelegram: boolean }) {
  if (!sendTelegram) return <Badge variant="outline" className="text-gray-500 gap-1"><MinusCircle className="h-3 w-3" />Off</Badge>;
  switch (status) {
    case 'SENT':     return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" />Sent</Badge>;
    case 'PARTIAL':  return <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1"><AlertCircle className="h-3 w-3" />Partial</Badge>;
    case 'FAILED':   return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
    case 'PENDING':  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sending…</Badge>;
    case 'SKIPPED':  return <Badge variant="outline" className="text-gray-500">Off</Badge>;
  }
}

/** Type badge shown next to the title row + on the detail dialog.
 *  V126 added the category field; this maps each value to a coloured
 *  badge so the operator can scan the list at a glance. */
function TypeBadge({ type }: { type: api.AnnouncementType }) {
  switch (type) {
    case 'HOLIDAY': return <Badge className="bg-rose-100 text-rose-700 border-rose-200 gap-1"><PartyPopper className="h-3 w-3" />Holiday</Badge>;
    case 'NEWS':    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1"><Newspaper className="h-3 w-3" />News</Badge>;
    case 'EVENTS':  return <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1"><CalendarHeart className="h-3 w-3" />Events</Badge>;
    case 'OTHERS':
    default:        return <Badge variant="outline" className="text-gray-600 gap-1"><Inbox className="h-3 w-3" />Others</Badge>;
  }
}
