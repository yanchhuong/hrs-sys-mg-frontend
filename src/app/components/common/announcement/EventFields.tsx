/**
 * v-event-rsvp — the "Event details" section of the New Announcement
 * form, shown for Type = Events: when and where, who organises it, a
 * cover photo, and whether guests answer Join / Maybe / Not join.
 *
 * Controlled: the parent holds an {@link EventDraft} and turns it into
 * request fields with {@link eventRequestFields}.
 */
import { useRef } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Clock, ImagePlus, MapPin, User, X } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { EVENT_KINDS, type AnnouncementRequest, type EventKind } from '../../../api/announcements';

export interface EventDraft {
  /** v-event-kind — Wedding / Birthday / Others. */
  kind: EventKind;
  date: string;        // yyyy-MM-dd
  start: string;       // HH:mm
  end: string;         // HH:mm
  location: string;
  organizer: string;
  rsvp: boolean;
  /** <input type="datetime-local"> value; blank = until the event day ends. */
  deadline: string;
  coverDataUrl: string | null;
}

export const emptyEventDraft = (): EventDraft => ({
  kind: 'OTHERS', date: '', start: '', end: '', location: '', organizer: '', rsvp: true, deadline: '', coverDataUrl: null,
});

/** Validate and turn the draft into request fields. Returns an error
 *  message instead when something needs fixing. */
export function eventRequestFields(d: EventDraft): Partial<AnnouncementRequest> | string {
  if (d.rsvp && !d.date) return 'Pick the event date — guests answer until then.';
  if (d.start && d.end && d.end <= d.start) return 'The event must end after it starts.';
  let rsvpDeadline: string | undefined;
  if (d.rsvp && d.deadline) {
    const ts = new Date(d.deadline);
    if (Number.isNaN(ts.getTime())) return 'Invalid RSVP deadline.';
    if (ts.getTime() <= Date.now()) return 'The RSVP deadline must be in the future.';
    rsvpDeadline = ts.toISOString();
  }
  return {
    eventDate: d.date || undefined,
    eventStartTime: d.start || undefined,
    eventEndTime: d.end || undefined,
    eventLocation: d.location.trim() || undefined,
    eventOrganizer: d.organizer.trim() || undefined,
    rsvpEnabled: d.rsvp,
    rsvpDeadline,
    coverImageDataUrl: d.coverDataUrl ?? undefined,
    eventKind: d.kind,
  };
}

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** A GIF goes up as it is — re-drawing it would keep only its first
 *  frame. A photo is shrunk to at most 1600 px wide JPEG so a phone
 *  camera shot stays well under the 5 MB the server accepts. */
async function toCoverDataUrl(file: File): Promise<string> {
  if (file.type === 'image/gif') {
    if (file.size > MAX_COVER_BYTES) throw new Error('That GIF is over 5 MB — pick a smaller one.');
    return await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => fail(new Error('Could not read that GIF'));
      r.readAsDataURL(file);
    });
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function EventFields({ value, onChange }: {
  value: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file'); return; }
    try {
      onChange({ coverDataUrl: await toCoverDataUrl(file) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that image');
    }
  };

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 space-y-3">
      <div className="text-xs font-semibold text-purple-800">Event details</div>

      {/* v-event-kind — sets the invitation's badge and colour. */}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What kind of event">
        {(Object.keys(EVENT_KINDS) as EventKind[]).map(k => {
          const m = EVENT_KINDS[k];
          const on = value.kind === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onChange({ kind: k })}
              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm transition ${
                on ? m.chip + ' ring-1 ring-current font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <span className="text-base leading-none">{m.emoji}</span>{m.label}
            </button>
          );
        })}
      </div>

      {/* Cover photo — the banner guests see first. */}
      {value.coverDataUrl ? (
        <div className="relative">
          <img src={value.coverDataUrl} alt="" className="w-full h-36 object-cover rounded-md" />
          <button
            type="button"
            onClick={() => onChange({ coverDataUrl: null })}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/70"
            aria-label="Remove cover photo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full h-24 rounded-md border border-dashed border-purple-300 bg-white text-sm text-purple-700 flex flex-col items-center justify-center gap-1 hover:bg-purple-50"
        >
          <ImagePlus className="h-5 w-5" />
          Add a cover photo or GIF <span className="text-[11px] text-gray-500">(optional · up to 5 MB)</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={e => { void pickCover(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Date {value.rsvp && <span className="text-red-500">*</span>}</Label>
          <Input type="date" value={value.date} onChange={e => onChange({ date: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Starts</Label>
          <Input type="time" value={value.start} onChange={e => onChange({ start: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ends</Label>
          <Input type="time" value={value.end} onChange={e => onChange({ end: e.target.value })} className="h-9" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Location</Label>
          <Input value={value.location} maxLength={255} placeholder="e.g. Phnom Penh"
            onChange={e => onChange({ location: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><User className="h-3.5 w-3.5" /> Organizer</Label>
          <Input value={value.organizer} maxLength={255} placeholder="e.g. Administration Department"
            onChange={e => onChange({ organizer: e.target.value })} className="h-9" />
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md bg-white border px-3 py-2 cursor-pointer">
        <div>
          <div className="text-sm font-medium">Ask guests to RSVP</div>
          <div className="text-[11px] text-gray-500">
            Each person gets their own link to answer Join / Maybe / Not join; you see the answers live.
          </div>
        </div>
        <Switch checked={value.rsvp} onCheckedChange={v => onChange({ rsvp: v })} />
      </label>
      {value.rsvp && (
        <div className="space-y-1">
          <Label className="text-xs">RSVP deadline <span className="text-gray-400">(optional — default: when the event ends; you can also close it early)</span></Label>
          <Input type="datetime-local" value={value.deadline}
            onChange={e => onChange({ deadline: e.target.value })} className="h-9 max-w-xs" />
        </div>
      )}
    </div>
  );
}
