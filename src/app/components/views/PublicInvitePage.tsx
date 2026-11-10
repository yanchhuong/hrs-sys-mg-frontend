/**
 * v-event-guest-link — /invite/{token}: the shared invitation.
 *
 * The sibling of /rsvp/{token}, and deliberately not the same thing. A
 * personal link names one invitee and answers AS them, so it cannot be
 * forwarded without handing over their identity. This one names
 * nobody: whoever opens it types their own name and answers as
 * themselves, which is what makes it safe to post in a group chat.
 *
 * The guest token that comes back from the first answer is kept in
 * localStorage, so coming back on the same device edits that answer
 * instead of adding a second person to the head-count. Losing it (new
 * device, cleared storage) only means a fresh answer — the worst case
 * is one duplicate, not a broken page, so it is not worth more than
 * this.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarX, CheckCircle2, Loader2 } from 'lucide-react';
import * as api from '../../api/announcements';
import { EventCard, RsvpChoices, RESPONSE_META } from '../common/announcement/EventPanel';

const tokenFromPath = () =>
  decodeURIComponent(window.location.pathname.replace(/^\/invite\//, '').split('/')[0] || '');

const storeKey = (token: string) => `event.guest.${token}`;

/** localStorage throws in a private window and in some embedded
 *  browsers; a guest who cannot be remembered must still be able to
 *  answer, so every access is best-effort. */
const readGuestToken = (token: string): string | null => {
  try { return window.localStorage.getItem(storeKey(token)); } catch { return null; }
};
const writeGuestToken = (token: string, value: string) => {
  try { window.localStorage.setItem(storeKey(token), value); } catch { /* not remembered; still answered */ }
};

export function PublicInvitePage() {
  const token = tokenFromPath();
  const [data, setData] = useState<api.PublicRsvp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [answer, setAnswer] = useState<api.RsvpResponse | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setGuestToken(readGuestToken(token));
    api.publicInvite(token)
      .then(d => { setData(d); document.title = `${d.title} · Invitation`; })
      .catch(() => setError('This invitation link is not valid any more.'));
  }, [token]);

  const submit = async (r: api.RsvpResponse) => {
    const who = name.trim();
    if (!who) {
      toast.error('Please enter your name first');
      return;
    }
    setSaving(true);
    try {
      const res = await api.answerAsGuest(token, who, r, guestToken);
      setGuestToken(res.guestToken);
      writeGuestToken(token, res.guestToken);
      setAnswer(res.response);
      setData(res.event);
      setDone(true);
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
            {data.body && <p className="text-sm text-gray-600 whitespace-pre-wrap -mt-2">{data.body}</p>}

            <div className="border-t pt-3">
              <EventCard coverUrl={null} date={data.date} startTime={data.startTime} endTime={data.endTime}
                location={data.location} organizer={data.organizer} />
            </div>

            {done && answer && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${RESPONSE_META[answer].badge}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Thanks {name.trim()} — your response "{RESPONSE_META[answer].label}" is saved.
              </div>
            )}

            {data.open && (
              <div className="border-t pt-3 space-y-1.5">
                <label htmlFor="guest-name" className="text-xs font-medium text-gray-600">Your name</label>
                <input
                  id="guest-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sok Dara"
                  maxLength={120}
                  autoComplete="name"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <p className="text-[11px] text-gray-400">
                  {done
                    ? 'Answer again to change your response.'
                    : 'So the organiser knows who is coming.'}
                </p>
              </div>
            )}

            <div className="border-t pt-3">
              {/* The name is required before an answer counts, so the
                  buttons stay disabled until there is one. */}
              <RsvpChoices
                current={answer}
                // Open is the event's; a missing name only holds the buttons
                // back, it does not make the event "closed".
                open={data.open}
                disabled={!name.trim()}
                closedByHost={data.closedByHost}
                saving={saving}
                onSubmit={r => void submit(r)}
              />
              {data.open && !name.trim() && (
                <p className="text-[11px] text-gray-400 mt-2">Enter your name to answer.</p>
              )}
            </div>
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 mt-4">Powered by Smart HRMS</p>
      </div>
    </div>
  );
}
