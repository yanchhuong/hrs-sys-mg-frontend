import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Megaphone, Send, RefreshCw, Plus, Loader2, AlertCircle,
  CheckCircle2, XCircle, MinusCircle, Search, Calendar, FileEdit, Hourglass, Info,
  PartyPopper, Newspaper, CalendarHeart, Inbox, ListChecks, Eye, UserCircle2,
} from 'lucide-react';

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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/announcements';
import * as employeesApi from '../../api/employees';
import * as customersApi from '../../api/customers';
import * as holidaysApi from '../../api/holidays';
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
  const { canCreate, canView } = useAuth();
  const canCreateAnnouncement = canCreate('announcements');
  const canViewAnnouncement   = canView('announcements');

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
  const [holidayId, setHolidayId] = useState<string>('');
  const [holidays, setHolidays]   = useState<holidaysApi.Holiday[]>([]);
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

  const openCreate = () => {
    setTitle('');
    setBody('');
    setAudienceType('ALL_EMPLOYEES');
    setRecipientIds([]);
    setSendTelegram(true);
    setPickerSearch('');
    setPublishAtLocal('');
    setExpiresAtLocal('');
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

  /** When the operator picks a Holiday, seed the title as
   *  "<friendly date> · <holiday name>" so the in-app list reads
   *  cleanly without HR having to type. Schedule date is NOT
   *  touched — the operator decides whether to send now / schedule
   *  for later via the footer buttons. Also flips type to HOLIDAY
   *  so the badge + dialog stay self-consistent. */
  const onPickHoliday = (id: string) => {
    setHolidayId(id);
    if (!id) return;
    const h = holidays.find(x => x.id === id);
    if (!h) return;
    // Friendly date: "Apr 14, 2026" — month-name + day + year gives
    // a useful at-a-glance read on the announcement list.
    const friendlyDate = new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    if (!title.trim()) setTitle(`${friendlyDate} · ${h.name}`);
    setType('HOLIDAY');
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
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

          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Holiday Notice" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)}
                placeholder="Office closed tomorrow." />
            </div>

            {/* Type (V126) + Audience side-by-side. Both are simple
                dropdowns — quick to scan, doesn't take the vertical
                space the previous 2x2 card grid did. */}
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
                <Label className="text-xs">Audience</Label>
                <Select value={audienceType} onValueChange={(v) => setAudienceType(v as api.AudienceType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_EMPLOYEES">All Employees</SelectItem>
                    <SelectItem value="ALL_CUSTOMERS">All Customers</SelectItem>
                    <SelectItem value="SPECIFIC_EMPLOYEES">Pick Employees…</SelectItem>
                    <SelectItem value="SPECIFIC_CUSTOMERS">Pick Customers…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                  Schedule for (optional)
                </Label>
                <Input type="datetime-local" value={publishAtLocal}
                  onChange={e => setPublishAtLocal(e.target.value)} className="h-9 text-sm" />
                <div className="text-[11px] text-gray-500">
                  Required only for the <strong>Schedule</strong> button.
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <Hourglass className="h-3.5 w-3.5 text-gray-500" />
                  Expires on (optional)
                </Label>
                <Input type="datetime-local" value={expiresAtLocal}
                  onChange={e => setExpiresAtLocal(e.target.value)} className="h-9 text-sm" />
                <div className="text-[11px] text-gray-500">
                  Blank = auto-expire 1 day after publish.
                </div>
              </div>
            </div>

            {/* Optional Holiday link — only meaningful when the
                announcement IS about a holiday, so hide for the
                News/Events/Others types. Sourced from Settings →
                Holidays (type='public', future dates only). Picking
                one fills publish_at to the holiday's date at 09:00
                local and seeds a "Holiday Notice: …" title. */}
            {type === 'HOLIDAY' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Linked Holiday (optional)</Label>
                {holidays.length > 0 ? (
                  <select
                    value={holidayId}
                    onChange={e => onPickHoliday(e.target.value)}
                    className="h-9 w-full border rounded-md px-2 text-sm bg-white"
                  >
                    <option value="">— none —</option>
                    {holidays.map(h => (
                      <option key={h.id} value={h.id}>{h.date} · {h.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[11px] text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                    No upcoming public holidays found for {new Date().getFullYear()}.
                    Add them in <strong>Settings → Holidays</strong> with type
                    <span className="font-mono"> public </span>and they'll
                    appear here.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex-1">
                <Label className="text-sm flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send via Telegram</Label>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Pushes to every recipient whose Telegram chat is linked. Status updates appear on this list.
                </div>
              </div>
              <Switch checked={sendTelegram} onCheckedChange={setSendTelegram} />
            </div>
          </div>

          {/* One button per publish mode. The choice IS the action —
              no upfront radio/card selection needed. Schedule is
              disabled until a date is filled in to prevent the
              "click Schedule with nothing chosen" mistake. */}
          <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void submit('draft')} disabled={creating}>
              <FileEdit className="h-3.5 w-3.5 mr-1.5" />
              Save Draft
            </Button>
            <Button variant="outline" onClick={() => void submit('schedule')}
              disabled={creating || !publishAtLocal}>
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Schedule
            </Button>
            <Button onClick={() => void submit('now')} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Publish Now
            </Button>
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
              <div className="bg-gray-50 rounded-md p-3 text-sm whitespace-pre-wrap">{detail.body}</div>

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
    </div>
  );
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
