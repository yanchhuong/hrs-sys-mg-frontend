import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, BedDouble, CalendarDays, Check, ChevronLeft,
  Loader2, MapPin, Phone, ShieldCheck, Users,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import * as api from '../../api/publicBooking';

/**
 * Anonymous /booking/{code} page (v-booking-public-link, V406).
 *
 * <p>The booking twin of /shop/{code}: no auth, no sidebar, no HRMS
 * chrome. A guest with the link picks their dates, sees what is
 * genuinely free for those dates, and asks to book it. The request
 * lands as a draft booking in the owner's list — and a draft already
 * holds the room, so it is off the market while the owner decides.</p>
 *
 * <h3>Why the dates come first</h3>
 * <p>A room list with no dates is a brochure: every room looks
 * available because nothing has been asked. The page therefore opens
 * on the date picker and fetches availability before it shows a single
 * price, so what a guest sees is what they can actually have. The
 * dateless payload is used only for the banner and for the empty
 * state.</p>
 *
 * <h3>Dates are half-open</h3>
 * <p>Check-out is exclusive throughout, matching the server and the
 * database constraint: a guest leaving on the 12th and one arriving on
 * the 12th do not clash, and "Nov 11 → Nov 12" is one night.</p>
 */

/** Steps. Payment is deliberately absent — see the note on {@link STEPS}. */
type Step = 'dates' | 'rooms' | 'details' | 'done';

/**
 * The designed flow had five steps ending in Payment. This one has
 * four: a guest here is *asking*, and the owner has not yet said the
 * room is theirs. Taking money before that would have to be refunded
 * every time the owner declines. Payment belongs after confirmation,
 * which is a separate surface (the owner's Mark Paid, or a payment
 * link sent on acceptance), not a step in this wizard.
 */
const STEPS: { key: Step; label: string }[] = [
  { key: 'dates',   label: 'Select Dates' },
  { key: 'rooms',   label: 'Choose Room' },
  { key: 'details', label: 'Your Details' },
  { key: 'done',    label: 'Confirmation' },
];

/** One bookable row on the list: a room type and the property it is in. */
interface Offer {
  property: api.PublicProperty;
  roomType: api.RoomType;
}

type SortKey = 'price-asc' | 'price-desc' | 'name';

/* ----------------------------- helpers ----------------------------- */

/** Today as ISO, in the browser's own day. The server re-checks against
 *  Cambodia days, so a guest just past midnight elsewhere may be told a
 *  date is in the past — correct, and better than guessing their zone. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Parse ISO as LOCAL midnight. `new Date('2026-11-11')` is UTC
 *  midnight and renders as the 10th west of Greenwich. */
function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Nov 11, 2026" */
function fmtDate(iso: string): string {
  if (!iso) return '';
  return parseIsoLocal(iso).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Wed" */
function fmtWeekday(iso: string): string {
  if (!iso) return '';
  return parseIsoLocal(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const ms = parseIsoLocal(checkOut).getTime() - parseIsoLocal(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** "night" -> "night", and the plural where a count needs one. Rates
 *  are labelled from the server's unit rather than hard-coded, so an
 *  hourly property added later reads correctly without touching every
 *  call site. */
function unitWord(u: api.RateUnit, n = 1): string {
  const one = u === 'hour' ? 'hour' : u === 'booking' ? 'booking' : 'night';
  return n === 1 ? one : `${one}s`;
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toFixed(2)}`;
}

/** The code sits in the path: /booking/{code}. */
function codeFromPath(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/^\/booking\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Readable message out of whatever the fetch layer threw. */
function errText(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message || '').trim();
    if (m) return m;
  }
  return fallback;
}

/* ============================== page ============================== */

export function PublicBookingPage() {
  const code = useMemo(codeFromPath, []);
  const today = useMemo(todayIso, []);

  const [page, setPage]       = useState<api.PublicBookingPayload | null>(null);
  const [pageErr, setPageErr] = useState<string | null>(null);

  const [checkIn, setCheckIn]   = useState<string>(() => addDaysIso(todayIso(), 0));
  const [checkOut, setCheckOut] = useState<string>(() => addDaysIso(todayIso(), 1));
  const [guests, setGuests]     = useState<number>(2);

  const [avail, setAvail]       = useState<api.AvailabilityPayload | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [step, setStep]       = useState<Step>('dates');
  const [picked, setPicked]   = useState<Offer | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sort, setSort]       = useState<SortKey>('price-asc');

  // Nights today. The server counts the same periods and names the
  // unit back, so this becomes hours the day the picker offers times.
  const periods = nightsBetween(checkIn, checkOut);

  /* The banner. Cheap, cached, and independent of the dates. */
  useEffect(() => {
    let live = true;
    if (!code) { setPageErr('That link is missing its code.'); return; }
    api.getPublicPage(code)
      .then(p => { if (live) { setPage(p); setPageErr(null); } })
      .catch(e => { if (live) setPageErr(errText(e, 'We could not open that booking page.')); });
    return () => { live = false; };
  }, [code]);

  const search = useCallback(async () => {
    if (!code || periods < 1) return;
    setSearching(true);
    setSearchErr(null);
    // Drop any earlier pick: a room held for the old dates means
    // nothing for the new ones, and leaving it selected would let a
    // guest carry a stale price into the summary.
    setPicked(null);
    try {
      const a = await api.getAvailability(code, checkIn, checkOut, guests);
      setAvail(a);
      setStep('rooms');
    } catch (e) {
      setAvail(null);
      setSearchErr(errText(e, 'We could not check those dates. Please try again.'));
    } finally {
      setSearching(false);
    }
  }, [code, checkIn, checkOut, guests, periods]);

  /** Keep check-out after check-in: moving check-in past it drags it. */
  const onCheckIn = (v: string) => {
    setCheckIn(v);
    if (v && (!checkOut || checkOut <= v)) setCheckOut(addDaysIso(v, 1));
  };

  /* Flatten properties → offers, then filter and sort for the list. */
  const offers: Offer[] = useMemo(() => {
    if (!avail) return [];
    return avail.properties.flatMap(p => p.roomTypes.map(rt => ({ property: p, roomType: rt })));
  }, [avail]);

  /** Chips across every room type on offer, with what's left of each. */
  const chips = useMemo(() => {
    const byName = new Map<string, number>();
    for (const o of offers) {
      byName.set(o.roomType.name, (byName.get(o.roomType.name) ?? 0) + o.roomType.availableUnits);
    }
    const total = offers.reduce((s, o) => s + o.roomType.availableUnits, 0);
    return [{ key: 'all', label: 'All Rooms', count: total },
            ...[...byName.entries()].map(([label, count]) => ({ key: label, label, count }))];
  }, [offers]);

  const shown = useMemo(() => {
    let list = typeFilter === 'all' ? offers : offers.filter(o => o.roomType.name === typeFilter);
    const price = (o: Offer) => o.roomType.rate ?? Number.POSITIVE_INFINITY;
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.roomType.name.localeCompare(b.roomType.name)
        : sort === 'price-desc' ? price(b) - price(a)
          : price(a) - price(b));
    // Sold-out types sink rather than vanish: a guest who can see the
    // room exists but is taken will try other dates, where one who
    // sees nothing assumes the place is empty of that type entirely.
    return list.sort((a, b) => Number(b.roomType.availableUnits > 0) - Number(a.roomType.availableUnits > 0));
  }, [offers, typeFilter, sort]);

  if (pageErr) return <Centered><NotFound message={pageErr} /></Centered>;
  if (!page)   return <Centered><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></Centered>;

  const stepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-slate-50">
      <Banner page={page} />

      {/* The stepper is desktop-only: on a phone it would eat a third
          of the first screen to say what the page already shows. */}
      <div className="mx-auto hidden max-w-6xl px-4 pt-6 md:block">
        <Stepper index={stepIndex} />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 md:py-6">
        <SearchCard
          checkIn={checkIn} checkOut={checkOut} guests={guests} today={today}
          periods={periods} busy={searching}
          onCheckIn={onCheckIn} onCheckOut={setCheckOut} onGuests={setGuests}
          onSearch={search}
        />

        {searchErr && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{searchErr}</span>
          </div>
        )}

        {searching && <ResultsSkeleton />}

        {!searching && avail && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <BedDouble className="h-5 w-5 text-blue-600" /> Available Rooms
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {fmtDate(avail.checkIn)} – {fmtDate(avail.checkOut)} · {avail.periods}{' '}
                    {unitWord('night', avail.periods)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="hidden sm:inline">Sort by:</span>
                  <select
                    value={sort} onChange={e => setSort(e.target.value as SortKey)}
                    className="h-9 shrink-0 rounded-md border border-gray-300 bg-white px-2 text-sm"
                  >
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              </div>

              {/* v-property-unit-type — the grouping is a "Type", the
                  same word the staff screens use, so an owner reading
                  their own public page recognises what they set up.
                  The heading above stays "Available Rooms": that one
                  names what is being listed, and a guest scanning for
                  somewhere to sleep does not look for "types". */}
              {chips.length > 2 && (
                <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="shrink-0 text-sm font-medium text-gray-500">Type:</span>
                  {chips.map(c => (
                    <button
                      key={c.key} type="button" onClick={() => setTypeFilter(c.key)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        typeFilter === c.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}
                    >
                      {c.label} ({c.count})
                    </button>
                  ))}
                </div>
              )}

              {shown.length === 0
                ? <EmptyRooms />
                : (
                  <div className="space-y-3">
                    {shown.map(o => (
                      <RoomCard
                        key={`${o.property.id}:${o.roomType.id}`}
                        offer={o} periods={avail.periods}
                        selected={picked?.roomType.id === o.roomType.id}
                        canBook={avail.requestsEnabled}
                        onPick={() => { setPicked(o); setStep('details'); }}
                      />
                    ))}
                  </div>
                )}
            </div>

            <Summary
              page={page} offer={picked} checkIn={avail.checkIn} checkOut={avail.checkOut}
              periods={avail.periods} guests={avail.guests} canBook={avail.requestsEnabled}
            />
          </div>
        )}
      </div>

      <Footer page={page} />
    </div>
  );
}

/* ============================ sections ============================ */

function Banner({ page }: { page: api.PublicBookingPayload }) {
  return (
    <div className="relative overflow-hidden bg-slate-800">
      {page.coverUrl && (
        <img src={page.coverUrl} alt="" aria-hidden
             className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Always-on scrim: the headline sits over a photo the tenant
          uploaded, and nothing guarantees it is dark where the text
          lands. Without this the title is unreadable on a bright one. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20" />
      <div className="relative mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="flex items-center gap-3">
          {page.logoUrl && (
            <img src={page.logoUrl} alt=""
                 className="h-10 w-10 rounded-lg bg-white/90 object-contain p-1" />
          )}
          <span className="text-sm font-medium text-white/90">{page.companyName}</span>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{page.headline}</h1>
        {page.tagline && <p className="mt-1.5 text-sm text-white/80 md:text-base">{page.tagline}</p>}
      </div>
    </div>
  );
}

function Stepper({ index }: { index: number }) {
  return (
    <ol className="flex items-center">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i < index ? 'bg-blue-600 text-white'
                : i === index ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                  : 'bg-gray-200 text-gray-500'}`}>
              {i < index ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`whitespace-nowrap text-xs ${
              i <= index ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-2 mb-5 h-0.5 flex-1 ${i < index ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </li>
      ))}
    </ol>
  );
}

interface SearchProps {
  checkIn: string; checkOut: string; guests: number; today: string;
  periods: number; busy: boolean;
  onCheckIn: (v: string) => void;
  onCheckOut: (v: string) => void;
  onGuests: (v: number) => void;
  onSearch: () => void;
}

function SearchCard(p: SearchProps) {
  const invalid = p.periods < 1;
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 md:p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <DateField label="Check-in" value={p.checkIn} min={p.today} onChange={p.onCheckIn} />
        <DateField label="Check-out" value={p.checkOut} min={addDaysIso(p.checkIn || p.today, 1)}
                   onChange={p.onCheckOut} />
        <Field label="Guests" icon={<Users className="h-4 w-4 text-blue-600" />}>
          <select
            value={p.guests} onChange={e => p.onGuests(Number(e.target.value))}
            className="w-full bg-transparent text-sm font-medium text-gray-900 outline-none"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <option key={n} value={n}>{n} {n === 1 ? 'Guest' : 'Guests'}</option>
            ))}
          </select>
        </Field>
        <Button
          onClick={p.onSearch} disabled={p.busy || invalid}
          className="h-auto min-h-[52px] gap-2 bg-blue-600 px-6 text-base hover:bg-blue-700"
        >
          {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          Check Availability
        </Button>
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-amber-700">Check-out has to be at least one night after check-in.</p>
      )}
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
        {children}
      </span>
    </div>
  );
}

function DateField(
  { label, value, min, onChange }:
  { label: string; value: string; min: string; onChange: (v: string) => void },
) {
  return (
    <Field label={label} icon={<CalendarDays className="h-4 w-4 text-blue-600" />}>
      <span className="flex items-baseline gap-1.5">
        {/* Native, not the app's DateInput: that one reads the tenant's
            date-format context, which does not exist out here on an
            anonymous page — and a phone's own date wheel beats any
            calendar we could draw. */}
        <input
          type="date" value={value} min={min} onChange={e => onChange(e.target.value)}
          aria-label={label}
          className="w-full bg-transparent text-sm font-medium text-gray-900 outline-none"
        />
        {value && <span className="shrink-0 text-xs text-gray-400">({fmtWeekday(value)})</span>}
      </span>
    </Field>
  );
}

function RoomCard(
  { offer, periods, selected, canBook, onPick }:
  { offer: Offer; periods: number; selected: boolean; canBook: boolean; onPick: () => void },
) {
  const { roomType: rt, property } = offer;
  const soldOut = rt.availableUnits < 1;
  return (
    <div className={`overflow-hidden rounded-xl bg-white ring-1 transition sm:flex ${
      selected ? 'ring-2 ring-blue-500' : 'ring-gray-200'} ${soldOut ? 'opacity-60' : ''}`}>
      <div className="relative h-40 shrink-0 bg-slate-100 sm:h-auto sm:w-48">
        {rt.imageUrl
          ? <img src={rt.imageUrl} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center">
              <BedDouble className="h-8 w-8 text-slate-300" />
            </div>}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-gray-900">{rt.name}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              soldOut ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700 ring-1 ring-green-200'}`}>
              {soldOut ? 'Fully booked' : 'Available'}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {rt.capacity != null && (
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {rt.capacity} Guests</span>
            )}
            <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {property.name}</span>
            {/* "2 left" earns its place; "7 left" is just noise. */}
            {!soldOut && rt.availableUnits <= 3 && (
              <span className="font-medium text-amber-700">Only {rt.availableUnits} left</span>
            )}
          </div>

          {rt.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">{rt.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-end justify-between gap-3 sm:flex-col sm:items-end">
          <div className="text-right">
            <div className="text-lg font-bold text-blue-700">{money(rt.rate)}</div>
            <div className="text-xs text-gray-500">
              / {unitWord(rt.rateUnit)}
              {periods > 1 && rt.total != null && <> · {money(rt.total)} total</>}
            </div>
          </div>
          <Button
            onClick={onPick} disabled={soldOut || !canBook}
            variant={selected ? 'default' : 'default'}
            className={`gap-1.5 ${selected ? 'bg-blue-700' : 'bg-blue-600'} hover:bg-blue-700`}
          >
            {selected ? <><Check className="h-4 w-4" /> Selected</> : <>Book Now <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Summary(
  { page, offer, checkIn, checkOut, periods, guests, canBook }:
  {
    page: api.PublicBookingPayload; offer: Offer | null;
    checkIn: string; checkOut: string; periods: number; guests: number; canBook: boolean;
  },
) {
  const rate  = offer?.roomType.rate ?? null;
  const unit  = offer?.roomType.rateUnit ?? 'night';
  const total = offer?.roomType.total ?? (rate != null ? rate * periods : null);

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <h3 className="font-semibold text-gray-900">Booking Summary</h3>

        {!offer ? (
          <p className="mt-3 text-sm text-gray-500">Pick a room to see your summary.</p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
                {offer.roomType.imageUrl
                  ? <img src={offer.roomType.imageUrl} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center">
                      <BedDouble className="h-4 w-4 text-slate-300" />
                    </div>}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{offer.roomType.name}</div>
                <div className="truncate text-xs text-gray-500">{offer.property.name}</div>
              </div>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
              {/* Named explicitly rather than left as the heading above
                  it: this is the line a guest reads back before
                  committing, and it is the same word the owner sees
                  on their Property screen. */}
              <Row label="Type"      value={offer.roomType.name} />
              <Row label="Check-in"  value={`${fmtDate(checkIn)} (${fmtWeekday(checkIn)})`} />
              <Row label="Check-out" value={`${fmtDate(checkOut)} (${fmtWeekday(checkOut)})`} />
              <Row label="Duration"  value={`${periods} ${unitWord(unit, periods)}`} />
              <Row label="Guests"    value={String(guests)} />
            </dl>

            <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
              <Row label={`Rate × ${periods} ${unitWord(unit, periods)}`}
                   value={money(rate != null ? rate * periods : null)} />
              {/* No tax line. The design had "Taxes & Fees (10%)", but
                  nothing in the booking module computes tax yet, and a
                  made-up percentage on a real total is a number a guest
                  would hold us to. It goes in when it comes from the
                  tenant's accounting settings. */}
            </dl>

            <div className="mt-3 flex items-baseline justify-between border-t border-gray-100 pt-3">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-xl font-bold text-blue-700">{money(total)}</span>
            </div>
          </>
        )}

        <Button
          className="mt-4 w-full gap-1.5 bg-blue-600 hover:bg-blue-700"
          disabled={!offer || !canBook}
        >
          Continue to Your Details <ArrowRight className="h-4 w-4" />
        </Button>

        {!canBook && (
          <p className="mt-2 text-center text-xs text-amber-700">
            This page is not taking requests right now.
          </p>
        )}

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 p-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="text-xs">
            <div className="font-medium text-blue-900">No payment now</div>
            <div className="text-blue-700">
              {page.companyName} confirms your dates first.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="truncate font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Footer({ page }: { page: api.PublicBookingPayload }) {
  if (!page.address && !page.phone) return null;
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-5 text-sm text-gray-600">
        {page.address && (
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> {page.address}
          </span>
        )}
        {page.phone && (
          <a href={`tel:${page.phone}`} className="flex items-center gap-1.5 hover:text-blue-700">
            <Phone className="h-4 w-4 text-gray-400" /> {page.phone}
          </a>
        )}
      </div>
    </footer>
  );
}

/* ----------------------------- states ----------------------------- */

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">{children}</div>;
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="max-w-sm text-center">
      <AlertCircle className="mx-auto h-10 w-10 text-gray-300" />
      <h1 className="mt-3 text-lg font-semibold text-gray-900">Booking page unavailable</h1>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}

function EmptyRooms() {
  return (
    <div className="rounded-xl bg-white p-8 text-center ring-1 ring-gray-200">
      <BedDouble className="mx-auto h-8 w-8 text-gray-300" />
      <p className="mt-2 font-medium text-gray-900">Nothing free for those dates</p>
      <p className="mt-1 text-sm text-gray-500">Try different dates, or fewer guests.</p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-gray-200">
          <Skeleton className="h-24 w-40 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
