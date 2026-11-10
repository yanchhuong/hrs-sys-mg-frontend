/**
 * v-event-rsvp — /rsvp/{token}: a person's own invitation, no sign-in.
 *
 * The token in the URL names one invitee of one event (it is the whole
 * capability, like the public invoice link). They see the event and
 * answer Join / Maybe / Not join, and may change it until the deadline.
 * Phone-first: most people open it from Telegram.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarX, CheckCircle2, Loader2 } from 'lucide-react';
import * as api from '../../api/announcements';
import { EventCard, RsvpChoices, RESPONSE_META } from '../common/announcement/EventPanel';

const tokenFromPath = () => decodeURIComponent(window.location.pathname.replace(/^\/rsvp\//, '').split('/')[0] || '');

export function PublicRsvpPage() {
  const token = tokenFromPath();
  const [data, setData] = useState<api.PublicRsvp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);

  useEffect(() => {
    api.publicRsvp(token)
      .then(d => { setData(d); document.title = `${d.title} · RSVP`; })
      .catch(() => setError('This invitation link is not valid any more.'));
  }, [token]);

  const submit = async (r: api.RsvpResponse) => {
    setSaving(true);
    try {
      setData(await api.answerPublicRsvp(token, r));
      setJustAnswered(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your response');
    } finally {
      setSaving(false);
    }
  };

  const logo = api.apiAsset(data?.companyLogo);

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center px-3 py-6 sm:py-10">
      <div className="w-full max-w-md">
        {error ? (
          <div className="rounded-2xl bg-white shadow-sm p-8 text-center space-y-2">
            <CalendarX className="h-10 w-10 text-gray-400 mx-auto" />
            <div className="font-semibold">Invitation not found</div>
            <p className="text-sm text-gray-500">{error} Ask the organiser for a new link.</p>
          </div>
        ) : !data ? (
          <div className="py-24 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm border p-4 space-y-4">
            {(data.companyName || logo) && (
              <div className="flex items-center gap-2">
                {logo && <img src={logo} alt="" className="h-7 w-7 rounded-md object-contain" />}
                {data.companyName && <div className="text-sm font-semibold text-gray-700 truncate">{data.companyName}</div>}
              </div>
            )}

            <EventCard kind={data.kind} title={data.title} coverUrl={data.coverUrl} date={null} startTime={null} endTime={null}
              location={null} organizer={null} />
            {data.inviteeName && <p className="text-sm text-gray-700 -mt-2">Hi {data.inviteeName},</p>}
            {data.body && <p className="text-sm text-gray-600 whitespace-pre-wrap -mt-2">{data.body}</p>}

            <div className="border-t pt-3">
              <EventCard coverUrl={null} date={data.date} startTime={data.startTime} endTime={data.endTime}
                location={data.location} organizer={data.organizer} />
            </div>

            {justAnswered && data.response && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${RESPONSE_META[data.response].badge}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Thanks — your response "{RESPONSE_META[data.response].label}" is saved.
              </div>
            )}

            <div className="border-t pt-3">
              <RsvpChoices current={data.response} open={data.open} closedByHost={data.closedByHost} saving={saving} onSubmit={r => void submit(r)} />
            </div>
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 mt-4">Powered by Smart HRMS</p>
      </div>
    </div>
  );
}
