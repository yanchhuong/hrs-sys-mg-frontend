import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarPlus, Clock, Heart, MapPin, Navigation } from 'lucide-react';
import * as api from '../../../api/announcements';
import { RsvpChoices, RESPONSE_META } from '../../common/announcement/EventPanel';
import { CoverGallery, coverList, inviteCovers } from '../../common/announcement/CoverGallery';

/**
 * v-invite-wedding — the wedding treatment of /invite/{token}.
 *
 * <p>Switched on by {@code eventKind === 'WEDDING'}; every other kind
 * keeps the plain card. That field has existed since v-event-kind and
 * its comment already called itself "the invitation's look", but until
 * now it only picked an emoji and a chip colour.</p>
 *
 * <h3>Why it opens</h3>
 * <p>A wedding invitation is a thing you are handed, and the moment of
 * opening it is most of what makes it feel like one. A page that
 * simply appears, fully scrolled, is a notice. So the link lands on a
 * closed card with the couple's names, and the invitation proper is
 * behind one deliberate tap.</p>
 *
 * <p>That tap earns its keep technically too: autoplaying audio is
 * blocked until a user gesture, so the open is the gesture any future
 * music would need anyway.</p>
 *
 * <h3>Motion is decoration, never plumbing</h3>
 * <p>Every section renders at full opacity with no transform when
 * motion is reduced, and the open card can always be dismissed. A
 * guest who never sees a single animation still gets the date, the
 * place and the RSVP buttons — this page's whole job.</p>
 */

interface Props {
  data: api.PublicRsvp;
  name: string;
  onName: (v: string) => void;
  answer: api.RsvpResponse | null;
  done: boolean;
  saving: boolean;
  onSubmit: (r: api.RsvpResponse) => void;
}

/* ----------------------------- helpers ----------------------------- */

/** Parse the event's local date + optional start time into a Date.
 *  Built from parts rather than `new Date(iso)` so a date-only string
 *  is local midnight and not UTC, which renders as the day before
 *  west of Greenwich. */
function eventStart(date: string | null, time: string | null): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time ?? '').split(':').map(Number);
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0);
}

function fmtLongDate(date: string | null): string {
  const d = eventStart(date, null);
  return d ? d.toLocaleDateString('en-US',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/** "6:30 PM" — times arrive as HH:mm. */
function fmtTime(t: string | null): string {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  if (!Number.isFinite(hh)) return t;
  const d = new Date(2000, 0, 1, hh, Number.isFinite(mm) ? mm : 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Google Maps needs no key for a plain search link, and it opens the
 *  installed app on a phone. */
const mapsUrl = (loc: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;

/** A .ics the guest can save. Built as a data URL so nothing has to be
 *  added to the API for it. */
function icsUrl(data: api.PublicRsvp): string | null {
  const start = eventStart(data.date, data.startTime);
  if (!start) return null;
  const end = eventStart(data.date, data.endTime) ?? new Date(start.getTime() + 3 * 3600_000);
  const stamp = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    + `T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  // Escaped per RFC 5545: commas, semicolons and newlines are
  // separators in this format and break the file if left raw.
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smart HRMS//Invitation//EN', 'BEGIN:VEVENT',
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(data.title)}`,
    data.location ? `LOCATION:${esc(data.location)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/* ------------------------------ page ------------------------------ */

export function WeddingInvite({ data, name, onName, answer, done, saving, onSubmit }: Props) {
  const [opened, setOpened] = useState(false);
  const reduce = useReducedMotion();
  // v-invite-cover — photos first, else the bulletin plate, else the
  // drawn default below. `photos` stays the UPLOADED list, so a plate
  // standing in as the cover never also appears under "Our Moments".
  const photos = coverList(data);
  const cover = inviteCovers(data)[0] ?? null;
  const start = useMemo(() => eventStart(data.date, data.startTime), [data.date, data.startTime]);
  const ics = useMemo(() => icsUrl(data), [data]);

  // The closed card owns the screen, so the page behind it must not
  // scroll under it on a phone. Restored on open and on unmount, so a
  // thrown render can't leave the document stuck.
  useEffect(() => {
    if (opened) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [opened]);

  return (
    <div className="min-h-screen bg-[#FBF7F2]">
      <AnimatePresence>
        {!opened && (
          <CardCover
            cover={cover} title={data.title} date={data.date}
            reduce={!!reduce} onOpen={() => setOpened(true)}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-md">
        {/* Hero */}
        <header className="relative overflow-hidden">
          {cover
            ? <img src={cover} alt="" className="h-72 w-full object-cover" />
            : <DefaultCover />}
          {cover && <div className="absolute inset-0 bg-gradient-to-t from-[#FBF7F2] via-transparent to-black/20" />}
        </header>

        <div className="space-y-10 px-5 pb-10 -mt-10 relative">
          <Reveal reduce={!!reduce}>
            <div className="text-center">
              <Rule />
              <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-[#A68B5B]">
                Wedding Invitation
              </p>
              <h1 className="mt-2 font-serif text-3xl leading-snug text-[#3B2F23]">{data.title}</h1>
              {data.date && (
                <p className="mt-2 text-sm text-[#7A6A56]">{fmtLongDate(data.date)}</p>
              )}
              <Rule className="mt-4" />
            </div>
          </Reveal>

          {data.body && (
            <Reveal reduce={!!reduce}>
              <p className="whitespace-pre-wrap text-center font-serif text-[15px] leading-relaxed text-[#5C4D3C]">
                {data.body}
              </p>
            </Reveal>
          )}

          {start && <Reveal reduce={!!reduce}><Countdown to={start} /></Reveal>}

          {/* When & where */}
          <Reveal reduce={!!reduce}>
            <section className="rounded-2xl border border-[#EADFCB] bg-white/70 p-5 text-center">
              <SectionTitle>When &amp; Where</SectionTitle>
              {data.date && (
                <p className="mt-3 font-serif text-lg text-[#3B2F23]">{fmtLongDate(data.date)}</p>
              )}
              {(data.startTime || data.endTime) && (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[#7A6A56]">
                  <Clock className="h-3.5 w-3.5" />
                  {fmtTime(data.startTime)}{data.endTime && ` – ${fmtTime(data.endTime)}`}
                </p>
              )}
              {data.location && (
                <p className="mt-3 flex items-start justify-center gap-1.5 text-sm text-[#5C4D3C]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#A68B5B]" />
                  <span className="whitespace-pre-wrap">{data.location}</span>
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {data.location && (
                  <a href={mapsUrl(data.location)} target="_blank" rel="noreferrer" className={PILL}>
                    <Navigation className="h-3.5 w-3.5" /> Directions
                  </a>
                )}
                {ics && (
                  <a href={ics} download="invitation.ics" className={PILL}>
                    <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
                  </a>
                )}
              </div>
              {data.organizer && (
                <p className="mt-4 text-xs text-[#9A8866]">{data.organizer}</p>
              )}
            </section>
          </Reveal>

          {/* The rest of the photos. The first is already the hero. */}
          {photos.length > 1 && (
            <Reveal reduce={!!reduce}>
              <section>
                <SectionTitle className="mb-3 text-center">Our Moments</SectionTitle>
                <div className="overflow-hidden rounded-2xl">
                  <CoverGallery urls={photos.slice(1)} />
                </div>
              </section>
            </Reveal>
          )}

          {/* RSVP */}
          <Reveal reduce={!!reduce}>
            <section className="rounded-2xl border border-[#EADFCB] bg-white/70 p-5">
              <SectionTitle className="text-center">Will you join us?</SectionTitle>

              {done && answer && (
                <div className={`mt-3 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${RESPONSE_META[answer].badge}`}>
                  <Heart className="h-4 w-4 shrink-0" />
                  Thank you {name.trim()} — "{RESPONSE_META[answer].label}" is saved.
                </div>
              )}

              {data.open && (
                <div className="mt-4 space-y-1.5">
                  <label htmlFor="guest-name" className="text-xs font-medium text-[#7A6A56]">
                    Your name
                  </label>
                  <input
                    id="guest-name" value={name} onChange={e => onName(e.target.value)}
                    placeholder="e.g. Sok Dara" maxLength={120} autoComplete="name"
                    className="w-full rounded-lg border border-[#EADFCB] bg-white px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-[#A68B5B]/40"
                  />
                  <p className="text-[11px] text-[#A1907A]">
                    {done ? 'Answer again to change your response.' : 'So we know who is coming.'}
                  </p>
                </div>
              )}

              <div className="mt-4">
                <RsvpChoices
                  current={answer} open={data.open} disabled={!name.trim()}
                  closedByHost={data.closedByHost} saving={saving} onSubmit={onSubmit}
                />
              </div>
            </section>
          </Reveal>

          <p className="pt-2 text-center text-[11px] text-[#B3A28F]">Powered by Smart HRMS</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- the cover ---------------------------- */

function CardCover(
  { cover, title, date, reduce, onOpen }:
  { cover: string | null; title: string; date: string | null; reduce: boolean; onOpen: () => void },
) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#FBF7F2] p-6"
      initial={false}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: '-100%' }}
      transition={{ duration: reduce ? 0.2 : 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {cover && (
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      )}
      <motion.button
        type="button" onClick={onOpen}
        // One target covering the whole card, so the gesture is "tap
        // the invitation" and not "find the small button".
        className="relative w-full max-w-xs rounded-[20px] border border-[#E2D3B8] bg-[#FFFDF9]/95
                   px-6 py-12 text-center shadow-xl"
        initial={reduce ? false : { opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        whileTap={reduce ? undefined : { scale: 0.97 }}
      >
        <Rule />
        <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[#A68B5B]">
          Wedding Invitation
        </p>
        <h1 className="mt-3 font-serif text-2xl leading-snug text-[#3B2F23]">{title}</h1>
        {date && <p className="mt-3 text-xs text-[#7A6A56]">{fmtLongDate(date)}</p>}
        <Rule className="mt-5" />
        <motion.p
          className="mt-6 text-xs tracking-wide text-[#A68B5B]"
          animate={reduce ? undefined : { opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          Tap to open
        </motion.p>
      </motion.button>
    </motion.div>
  );
}

/* --------------------------- small pieces --------------------------- */

const PILL = 'inline-flex items-center gap-1.5 rounded-full border border-[#E2D3B8] bg-white '
  + 'px-3 py-1.5 text-xs font-medium text-[#7A6A56] hover:bg-[#FBF7F2]';

/**
 * v-invite-cover — the cover when there is no photo and no plate.
 *
 * Drawn rather than left blank. An invitation whose organiser never
 * uploaded anything used to open on an empty band, which reads as a
 * broken image; this reads as a plain card, which is what a letterpress
 * invitation with no photograph actually looks like.
 */
function DefaultCover() {
  return (
    <div className="relative h-52 w-full overflow-hidden bg-gradient-to-b from-[#F3E9D7] to-[#FBF7F2]"
         aria-hidden>
      {/* Two soft rings, off-centre, for depth without a texture file. */}
      <div className="absolute -left-10 -top-14 h-48 w-48 rounded-full border border-[#E2D3B8]/60" />
      <div className="absolute -right-16 top-6 h-56 w-56 rounded-full border border-[#E2D3B8]/40" />
      <div className="flex h-full items-center justify-center">
        <span className="text-4xl text-[#C9B389]">&#10022;</span>
      </div>
    </div>
  );
}

function Rule({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`} aria-hidden>
      <span className="h-px w-10 bg-[#E2D3B8]" />
      <span className="text-[#C9B389]">&#10022;</span>
      <span className="h-px w-10 bg-[#E2D3B8]" />
    </div>
  );
}

function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[11px] uppercase tracking-[0.25em] text-[#A68B5B] ${className}`}>
      {children}
    </h2>
  );
}

/** Fades a section up as it scrolls in. `once` so a section does not
 *  re-animate every time it passes the viewport, which reads as a
 *  glitch rather than as polish. */
function Reveal({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function Countdown({ to }: { to: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);   // minutes, not seconds
    return () => clearInterval(id);
  }, []);

  const ms = to.getTime() - now;
  if (ms <= 0) {
    return (
      <p className="text-center font-serif text-lg text-[#A68B5B]">Today is the day</p>
    );
  }
  const days  = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins  = Math.floor((ms % 3_600_000) / 60_000);

  return (
    <div className="flex justify-center gap-3">
      {[{ v: days, l: 'Days' }, { v: hours, l: 'Hours' }, { v: mins, l: 'Minutes' }].map(u => (
        <div key={u.l}
             className="min-w-[72px] rounded-xl border border-[#EADFCB] bg-white/70 py-3 text-center">
          <div className="font-serif text-2xl tabular-nums text-[#3B2F23]">{u.v}</div>
          <div className="text-[10px] uppercase tracking-widest text-[#A68B5B]">{u.l}</div>
        </div>
      ))}
    </div>
  );
}
