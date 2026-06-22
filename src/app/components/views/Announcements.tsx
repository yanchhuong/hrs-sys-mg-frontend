import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Megaphone, Send, RefreshCw, Plus, Users, UserCheck, ListChecks, Loader2, AlertCircle,
  CheckCircle2, XCircle, MinusCircle, Search,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/announcements';
import * as employeesApi from '../../api/employees';
import * as customersApi from '../../api/customers';

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

  // Cache the roster + customer list once when the dialog opens —
  // both are bounded sets that don't need pagination at this scale.
  const [employees, setEmployees] = useState<employeesApi.Employee[]>([]);
  const [customers, setCustomers] = useState<customersApi.Customer[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Detail-dialog state.
  const [detail, setDetail] = useState<api.Announcement | null>(null);
  const [logs, setLogs]     = useState<api.TelegramLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

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
          const res = await employeesApi.list({ size: 500 });
          setEmployees(res.content ?? []);
        } else {
          const res = await customersApi.list({ size: 500 });
          setCustomers(res.content ?? []);
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
    setCreateOpen(true);
  };

  const submit = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t) { toast.error('Title is required'); return; }
    if (!b) { toast.error('Body is required'); return; }
    const isSpecific = audienceType === 'SPECIFIC_EMPLOYEES' || audienceType === 'SPECIFIC_CUSTOMERS';
    if (isSpecific && recipientIds.length === 0) {
      toast.error('Pick at least one recipient');
      return;
    }
    setCreating(true);
    try {
      await api.create({
        title: t,
        body: b,
        audienceType,
        recipientIds: isSpecific ? recipientIds : undefined,
        sendTelegram,
      });
      toast.success(sendTelegram ? 'Published — Telegram fan-out started' : 'Published');
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (a: api.Announcement) => {
    setDetail(a);
    setLogs([]);
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
      return employees
        .filter(e => !q || e.name.toLowerCase().includes(q)
          || (e.id?.toLowerCase().includes(q) ?? false))
        .map(e => ({ id: (e as { apiId?: string }).apiId ?? e.id, label: e.name, subtitle: e.id }));
    }
    if (audienceType === 'SPECIFIC_CUSTOMERS') {
      return customers
        .filter(c => !q || c.name.toLowerCase().includes(q)
          || (c.phone?.toLowerCase().includes(q) ?? false))
        .map(c => ({ id: c.id, label: c.name, subtitle: c.phone ?? '' }));
    }
    return [];
  }, [audienceType, employees, customers, pickerSearch]);

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
            <h1 className="text-3xl font-bold">Announcements</h1>
            <p className="text-sm text-gray-500">
              Broadcast a message to employees or customers. When Telegram is on,
              every linked recipient also gets a push to their bot chat.
            </p>
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
                <TableHead className="w-[160px]">Audience</TableHead>
                <TableHead className="w-[150px]">Telegram</TableHead>
                <TableHead className="w-[160px]">Published</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-gray-500 py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-gray-500 py-8">
                  No announcements yet. {canCreateAnnouncement && <>Click <strong>New Announcement</strong> to publish the first one.</>}
                </TableCell></TableRow>
              )}
              {rows.map(a => (
                <TableRow key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => void openDetail(a)}>
                  <TableCell className="font-medium">
                    {a.title}
                    <div className="text-[11px] text-gray-500 truncate max-w-md mt-0.5">{a.body}</div>
                  </TableCell>
                  <TableCell><AudienceBadge type={a.audienceType} /></TableCell>
                  <TableCell><TelegramStatusBadge status={a.telegramSentStatus} sendTelegram={a.sendTelegram} /></TableCell>
                  <TableCell className="text-xs text-gray-600">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</TableCell>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-600" />
              New Announcement
            </DialogTitle>
            <DialogDescription>
              The body shows on the in-app list. When Telegram is on, every
              linked recipient also gets a chat push.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Holiday Notice" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)}
                placeholder="Office closed tomorrow." />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Audience</Label>
              <div className="grid grid-cols-2 gap-2">
                <AudienceCard active={audienceType === 'ALL_EMPLOYEES'} onClick={() => setAudienceType('ALL_EMPLOYEES')}
                  icon={<Users className="h-4 w-4" />} label="All Employees" hint="Every linked employee" />
                <AudienceCard active={audienceType === 'ALL_CUSTOMERS'} onClick={() => setAudienceType('ALL_CUSTOMERS')}
                  icon={<UserCheck className="h-4 w-4" />} label="All Customers" hint="Every linked customer" />
                <AudienceCard active={audienceType === 'SPECIFIC_EMPLOYEES'} onClick={() => setAudienceType('SPECIFIC_EMPLOYEES')}
                  icon={<ListChecks className="h-4 w-4" />} label="Pick Employees" hint="Selected employees only" />
                <AudienceCard active={audienceType === 'SPECIFIC_CUSTOMERS'} onClick={() => setAudienceType('SPECIFIC_CUSTOMERS')}
                  icon={<ListChecks className="h-4 w-4" />} label="Pick Customers" hint="Selected customers only" />
              </div>
            </div>

            {(audienceType === 'SPECIFIC_EMPLOYEES' || audienceType === 'SPECIFIC_CUSTOMERS') && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center justify-between">
                  <span>Recipients ({recipientIds.length} selected)</span>
                  {recipientIds.length > 0 && (
                    <button type="button" className="text-blue-600 text-[11px]" onClick={() => setRecipientIds([])}>
                      Clear all
                    </button>
                  )}
                </Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                    placeholder={audienceType === 'SPECIFIC_EMPLOYEES' ? 'Search name or empNo…' : 'Search name or phone…'}
                    className="pl-7 h-8 text-sm" />
                </div>
                <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                  {pickerLoading && (
                    <div className="p-3 text-center text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> Loading…</div>
                  )}
                  {!pickerLoading && pickerOptions.length === 0 && (
                    <div className="p-3 text-center text-xs text-gray-500">No matches.</div>
                  )}
                  {!pickerLoading && pickerOptions.map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={recipientIds.includes(opt.id)} onChange={() => toggleRecipient(opt.id)} className="h-3.5 w-3.5" />
                      <span className="flex-1 text-sm">{opt.label}</span>
                      {opt.subtitle && <span className="text-[11px] text-gray-500">{opt.subtitle}</span>}
                    </label>
                  ))}
                </div>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={submit} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {creating ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Detail dialog ----- */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-blue-600" />
              {detail?.title}
            </DialogTitle>
            <DialogDescription>
              {detail && <>Published {new Date(detail.createdAt).toLocaleString()} · <AudienceBadge type={detail.audienceType} /></>}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-md p-3 text-sm whitespace-pre-wrap">{detail.body}</div>

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
                              <span className="font-mono">{l.recipientType.toLowerCase()}</span> · {l.recipientId.slice(0, 8)}
                              {l.telegramChatId !== null && (
                                <span className="text-gray-500 ml-2">chat {l.telegramChatId}</span>
                              )}
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
          <DialogFooter>
            <Button onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----- helpers ----- */

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

function AudienceCard({ active, onClick, icon, label, hint }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left border rounded-md p-2.5 flex items-start gap-2 transition-colors ${
        active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50 border-gray-200'
      }`}>
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{hint}</div>
      </div>
    </button>
  );
}
