/**
 * v-event-rsvp — the event part of an announcement's detail view:
 *
 *   • the event card (cover, date, time, location, organiser)
 *   • "Will you attend?" for a viewer who is invited
 *   • the organiser's attendance overview: the tally, the response rate
 *     and the participant list (copy a person's link, add, remove)
 *
 * The choice tiles are shared with the public RSVP page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays, Check, CheckCircle2, Clock, HelpCircle, Link2, Loader2, MapPin,
  Plus, Search, Share2, Trash2, User, UserPlus, XCircle,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Checkbox } from '../../ui/checkbox';
import { useConfirm } from '../../../context/ConfirmContext';
import * as api from '../../../api/announcements';
import { CoverGallery } from './CoverGallery';
import * as employeesApi from '../../../api/employees';
import * as customersApi from '../../../api/customers';

/* ── shared: the answer choices ─────────────────────────────────── */

export const RESPONSE_META: Record<api.RsvpResponse, {
  label: string; hint: string; Icon: typeof CheckCircle2;
  tile: string; icon: string; badge: string; bar: string;
}> = {
  JOIN:    { label: 'Join',     hint: 'Yes, I will attend.', Icon: CheckCircle2,
             tile: 'border-emerald-400 bg-emerald-50', icon: 'text-emerald-600',
             badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500' },
  MAYBE:   { label: 'Maybe',    hint: 'I am not sure yet.', Icon: HelpCircle,
             tile: 'border-amber-400 bg-amber-50', icon: 'text-amber-600',
             badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' },
  DECLINE: { label: 'Not Join', hint: 'Sorry, I cannot attend.', Icon: XCircle,
             tile: 'border-red-400 bg-red-50', icon: 'text-red-600',
             badge: 'bg-red-50 text-red-700 border-red-200', bar: 'bg-red-500' },
};
const ORDER: api.RsvpResponse[] = ['JOIN', 'MAYBE', 'DECLINE'];

/** "Will you attend?" — pick one, then Submit. */
export function RsvpChoices({ current, open, saving, onSubmit, disabled = false, closedByHost = false }: {
  current: api.RsvpResponse | null;
  /** The event takes answers. False shows the closed note. */
  open: boolean;
  saving: boolean;
  onSubmit: (r: api.RsvpResponse) => void;
  /** This person can't answer yet (e.g. no name typed) — the buttons wait,
   *  but nothing says "closed". */
  disabled?: boolean;
  /** v-rsvp-host-close — closed by the host, so say it is full. */
  closedByHost?: boolean;
}) {
  const [picked, setPicked] = useState<api.RsvpResponse | null>(current);
  useEffect(() => { setPicked(current); }, [current]);
  const changed = picked != null && picked !== current;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Will you attend this event?</div>
      <div className="space-y-2" role="radiogroup">
        {ORDER.map(r => {
          const m = RESPONSE_META[r];
          const on = picked === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!open || saving || disabled}
              onClick={() => setPicked(r)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                on ? m.tile : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <m.Icon className={`h-5 w-5 shrink-0 ${m.icon}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{m.label}</span>
                <span className="block text-xs text-gray-500">{m.hint}</span>
              </span>
              {on && <Check className={`h-4 w-4 ${m.icon}`} />}
            </button>
          );
        })}
      </div>
      {open ? (
        <>
          <Button className="w-full" disabled={!changed || saving || disabled} onClick={() => picked && onSubmit(picked)}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {current ? 'Update response' : 'Submit response'}
          </Button>
          <p className="text-[11px] text-center text-gray-500">You can change your response before the RSVP deadline.</p>
        </>
      ) : (
        <p className="text-xs text-center text-gray-500">
          {closedByHost ? 'The host has closed responses — this event is full.' : 'Responses for this event are closed.'}
        </p>
      )}
    </div>
  );
}

/** Cover + date / time / location / organiser. */
export function EventCard({ kind, title, body, coverUrl, coverUrls, date, startTime, endTime, location, organizer }: {
  /** v-event-kind — the badge's wording and colour. */
  kind?: string | null;
  title?: string;
  /** The invitation's message, under the cover (and title). */
  body?: string;
  coverUrl: string | null;
  /** v-event-gallery — several photos swipe; falls back to coverUrl. */
  coverUrls?: string[];
  date: string | null; startTime: string | null; endTime: string | null;
  location: string | null; organizer: string | null;
}) {
  const covers = coverUrls && coverUrls.length ? coverUrls : coverUrl ? [coverUrl] : [];
  const time = api.formatEventTime(startTime, endTime);
  const rows: [typeof CalendarDays, string, string][] = [];
  if (date) rows.push([CalendarDays, 'Date', api.formatEventDate(date)]);
  if (time) rows.push([Clock, 'Time', time]);
  if (location) rows.push([MapPin, 'Location', location]);
  if (organizer) rows.push([User, 'Organizer', organizer]);
  return (
    <div className="space-y-3">
      {covers.length > 0 && <CoverGallery urls={covers} className="rounded-xl" />}
      {/* The badge shows with a title, or alone when a kind is given
          (the detail dialog already has the title in its header). */}
      {(title || kind) && (
        <div>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${api.kindMeta(kind).chip}`}>
            {api.kindMeta(kind).emoji} {api.kindMeta(kind).invite}
          </span>
          {title && <div className="mt-1.5 text-lg font-bold">{title}</div>}
        </div>
      )}
      {body && <p className="text-sm text-gray-700 whitespace-pre-wrap">{body}</p>}
      {rows.length > 0 && (
        <div className="space-y-1.5 text-sm">
          {rows.map(([Icon, label, v]) => (
            <div key={label} className="flex items-start gap-2">
              <Icon className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
              <span><span className="font-medium">{label}:</span> {v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── the detail panel ───────────────────────────────────────────── */

export function EventPanel({ announcement, canManage, onChanged }: {
  announcement: api.Announcement;
  /** Organiser actions: add / remove participants. */
  canManage: boolean;
  /** Re-read the announcement (its tally) after a change. */
  onChanged: () => void | Promise<void>;
}) {
  const ev = announcement.event!;
  const [saving, setSaving] = useState(false);

  const answer = async (r: api.RsvpResponse) => {
    setSaving(true);
    try {
      await api.answerMyRsvp(announcement.id, r);
      toast.success('Response saved');
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your response');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* v-share-till-over — first thing the organiser sees, and kept
          until the event is over: after the RSVP deadline the link still
          shows the invitation, it just no longer takes answers. */}
      {canManage && ev.rsvpEnabled && announcement.status !== 'DRAFT' && !api.eventOver(ev) && (
        <ShareInvite id={announcement.id} open={ev.open} />
      )}
      {/* The message sits under the cover, as on the guest's page; the
          dialog leaves out its own message box for an event. */}
      <EventCard kind={ev.kind ?? 'OTHERS'} body={announcement.richTemplate ? undefined : announcement.body}
        coverUrl={ev.coverUrl} coverUrls={ev.coverUrls} date={ev.date} startTime={ev.startTime} endTime={ev.endTime}
        location={ev.location} organizer={ev.organizer} />
      {ev.rsvpEnabled && ev.invitedMe && (
        <div className="rounded-lg border p-3">
          <RsvpChoices current={ev.myResponse} open={ev.open} closedByHost={ev.closedByHost} saving={saving} onSubmit={answer} />
        </div>
      )}
      {ev.rsvpEnabled && announcement.status !== 'DRAFT' && (
        <AttendanceOverview announcement={announcement} canManage={canManage} onChanged={onChanged} />
      )}
    </div>
  );
}

/**
 * v-event-guest-link — the one link an organiser posts in a group
 * chat, as opposed to the personal links in the invitee list below.
 *
 * <p>Rendered for an organiser until the event is over
 * (v-share-till-over). Past the RSVP deadline the link still opens the
 * invitation — it only stops taking answers — so it is still worth
 * passing on; the card says which. Organiser, because handing out
 * something that lets anyone answer is their decision to make.</p>
 *
 * <p>Minting is idempotent on the server, so clicking twice is safe
 * and always yields the same URL — a link already sent out keeps
 * working.</p>
 */
function ShareInvite({ id, open }: { id: string; open: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      const res = await api.shareLink(id);
      setUrl(res.url);
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success('Invite link copied');
      } catch {
        // Clipboard blocked (no permission, or an insecure origin).
        // The link is on screen, so it can still be copied by hand.
        toast.success('Invite link ready');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not make the link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-blue-900">Share invite link</div>
          <div className="text-xs text-blue-800/80">
            {open
              ? 'Anyone with it can RSVP as a guest — post it in a group chat.'
              : 'Responses are closed; the link still shows the invitation until the event is over.'}
          </div>
        </div>
        <Button size="sm" className="h-8 shrink-0" onClick={() => void make()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : url ? 'Copy again' : 'Get link'}
        </Button>
      </div>
      {url && (
        <input
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
          className="w-full rounded border bg-white px-2 py-1 text-xs text-gray-600"
        />
      )}
    </div>
  );
}

type Filter = 'ALL' | api.RsvpResponse | 'PENDING';

function AttendanceOverview({ announcement, canManage, onChanged }: {
  announcement: api.Announcement;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const ev = announcement.event!;
  const confirm = useConfirm();
  const [rows, setRows] = useState<api.RsvpParticipant[] | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listParticipants(announcement.id));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : 'Could not load participants');
    }
  }, [announcement.id]);
  useEffect(() => { void load(); }, [load]);

  const [closing, setClosing] = useState(false);
  const toggleClosed = async () => {
    if (!ev.closedByHost) {
      const ok = await confirm({
        title: 'Close responses?',
        message: 'Nobody can answer any more — use this when the event is full. Answers already given stay, and you can reopen it.',
        confirmLabel: 'Close responses',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    setClosing(true);
    try {
      if (ev.closedByHost) await api.reopenRsvp(announcement.id); else await api.closeRsvp(announcement.id);
      toast.success(ev.closedByHost ? 'Responses reopened' : 'Responses closed');
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change it');
    } finally {
      setClosing(false);
    }
  };

  const answered = ev.join + ev.maybe + ev.decline;
  const rate = ev.invited > 0 ? Math.round((answered / ev.invited) * 100) : 0;
  const pct = (n: number) => (ev.invited > 0 ? (n / ev.invited) * 100 : 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (filter === 'ALL' || (filter === 'PENDING' ? r.response == null : r.response === filter))
      && (!needle || r.name.toLowerCase().includes(needle) || (r.detail ?? '').toLowerCase().includes(needle)));
  }, [rows, filter, q]);

  const copyLink = async (r: api.RsvpParticipant) => {
    // A guest has no personal link: their token is their own way back
    // in to change an answer, not the organiser's to pass on.
    if (!r.link) return;
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(r.id);
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 1500);
      toast.success(`Link for ${r.name} copied`);
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const remove = async (r: api.RsvpParticipant) => {
    const ok = await confirm({
      title: `Remove ${r.name}?`,
      message: 'They are taken off the invite list and their link stops working.',
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.removeParticipant(announcement.id, r.id);
      toast.success(`${r.name} removed`);
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  const tiles: [string, number, string][] = [
    ['Invited', ev.invited, 'text-gray-900'],
    ['Join', ev.join, 'text-emerald-600'],
    ['Maybe', ev.maybe, 'text-amber-600'],
    ['Not Join', ev.decline, 'text-red-600'],
    // Seen / Not seen are about invitees only: a guest came through
    // the shared link and was never sent one, so neither applies.
    ['Seen', ev.seen, 'text-blue-600'],
    ['Not seen', ev.notSeen, 'text-gray-500'],
  ];
  // Only once someone has actually come in that way — an always-on
  // "Guests 0" would imply a shared link exists when none was made.
  if (ev.guests > 0) tiles.push(['Guests', ev.guests, 'text-emerald-600']);
  const filters: [Filter, string, number][] = [
    ['ALL', 'All', ev.invited],
    ['JOIN', 'Join', ev.join],
    ['MAYBE', 'Maybe', ev.maybe],
    ['DECLINE', 'Not Join', ev.decline],
    ['PENDING', 'No reply', ev.pending],
  ];

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Event Attendance Overview</div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] rounded-full px-2 py-0.5 border ${ev.open
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : ev.closedByHost ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {ev.open ? 'Taking responses' : ev.closedByHost ? 'Closed — full' : 'Responses closed'}
          </span>
          {/* v-rsvp-host-close — stop answers when the event is full;
              reopen is shown only while the event is still ahead. */}
          {canManage && (ev.open || (ev.closedByHost && !api.eventOver(ev))) && (
            <Button size="sm" variant="outline" className="h-7" disabled={closing} onClick={() => void toggleClosed()}>
              {closing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {ev.closedByHost ? 'Reopen responses' : 'Close responses'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map(([label, n, tone]) => (
          <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className={`text-2xl font-bold tabular-nums ${tone}`}>{n}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Response rate</span>
          <span className="tabular-nums font-semibold">{rate}% <span className="text-xs font-normal text-gray-500">({answered} of {ev.invited})</span></span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden flex">
          <div className="bg-emerald-500" style={{ width: `${pct(ev.join)}%` }} />
          <div className="bg-amber-500" style={{ width: `${pct(ev.maybe)}%` }} />
          <div className="bg-red-500" style={{ width: `${pct(ev.decline)}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span><i className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1" />Join</span>
          <span><i className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-1" />Maybe</span>
          <span><i className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />Not Join</span>
          <span><i className="inline-block h-2 w-2 rounded-full bg-gray-300 mr-1" />No reply ({ev.pending})</span>
        </div>
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Participant list</div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Add participants
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x">
          {filters.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${filter === k
                ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {label} <span className="tabular-nums opacity-80">{n}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ID or phone" className="pl-8 h-9" />
        </div>
        <div className="divide-y rounded-lg border max-h-72 overflow-y-auto">
          {rows == null ? (
            <div className="py-6 text-center text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Loading…</div>
          ) : shown.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">No one here.</div>
          ) : shown.map(r => {
            const m = r.response ? RESPONSE_META[r.response] : null;
            return (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  {r.detail && <div className="text-[11px] text-gray-500 truncate">{r.detail}</div>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  m ? m.badge : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {m ? m.label : 'No reply'}
                </span>
                {/* A guest has no personal link to hand out. */}
                {r.link && (
                  <button type="button" onClick={() => void copyLink(r)} title="Copy this person's RSVP link"
                    className="shrink-0 h-7 w-7 rounded-md text-gray-500 hover:bg-gray-100 flex items-center justify-center">
                    {copied === r.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
                  </button>
                )}
                {canManage && (
                  <button type="button" onClick={() => void remove(r)} title="Remove from the invite list"
                    className="shrink-0 h-7 w-7 rounded-md text-red-500 hover:bg-red-50 flex items-center justify-center">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {addOpen && (
        <AddParticipantsDialog
          announcement={announcement}
          invitedIds={new Set((rows ?? []).map(r => `${r.recipientType}:${r.recipientId}`))}
          onClose={() => setAddOpen(false)}
          onAdded={async () => { setAddOpen(false); await Promise.all([load(), onChanged()]); }}
        />
      )}
    </div>
  );
}

/** Pick employees (or customers, for a customer audience) not yet invited. */
function AddParticipantsDialog({ announcement, invitedIds, onClose, onAdded }: {
  announcement: api.Announcement;
  invitedIds: Set<string>;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const kind: 'EMPLOYEE' | 'CUSTOMER' = announcement.audienceType.endsWith('CUSTOMERS') ? 'CUSTOMER' : 'EMPLOYEE';
  const [people, setPeople] = useState<{ id: string; name: string; detail: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = kind === 'EMPLOYEE'
          ? ((await employeesApi.list({ size: 500 })).content ?? []).map(e => ({ id: e.id, name: e.name, detail: e.empNo ?? '' }))
          : ((await customersApi.list({ size: 500 })).content ?? []).map(c => ({ id: c.id, name: c.name, detail: c.phone ?? '' }));
        setPeople(list.filter(p => !invitedIds.has(`${kind}:${p.id}`)));
      } catch (e) {
        setPeople([]);
        toast.error(e instanceof Error ? e.message : 'Could not load people');
      }
    })();
    // invitedIds is a fresh Set each render; load once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const shown = (people ?? []).filter(p => {
    const n = q.trim().toLowerCase();
    return !n || p.name.toLowerCase().includes(n) || p.detail.toLowerCase().includes(n);
  });

  const add = async () => {
    setSaving(true);
    try {
      const { added } = await api.addParticipants(announcement.id, kind, [...picked]);
      toast.success(`${added} ${added === 1 ? 'person' : 'people'} invited`);
      await onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add participants</DialogTitle>
          <DialogDescription>Each person gets their own RSVP link. {kind === 'EMPLOYEE' ? 'Employees' : 'Customers'} already invited are not listed.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="pl-8 h-9" />
        </div>
        <div className="divide-y rounded-lg border max-h-72 overflow-y-auto">
          {people == null ? (
            <div className="py-6 text-center text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Loading…</div>
          ) : shown.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">Everyone is invited already.</div>
          ) : shown.map(p => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
              <Checkbox checked={picked.has(p.id)} onCheckedChange={v => setPicked(s => {
                const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n;
              })} />
              <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
              {p.detail && <span className="text-[11px] text-gray-500">{p.detail}</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void add()} disabled={picked.size === 0 || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Invite {picked.size > 0 ? picked.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

