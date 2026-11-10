/**
 * v-event-gallery — an invitation's photos / GIFs, full width and
 * uncropped. One photo is shown as is; several swipe (touch) or step
 * with the arrows (mouse), with dots and a 1 / n counter.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as api from '../../../api/announcements';

export function CoverGallery({ urls, className = '' }: {
  /** Relative API paths (or data URLs); resolved with apiAsset. */
  urls: (string | null | undefined)[];
  /** Outer box — e.g. rounding; the gallery itself is edge to edge. */
  className?: string;
}) {
  const srcs = urls.map(u => (u && u.startsWith('data:') ? u : api.apiAsset(u))).filter((u): u is string => !!u);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  useEffect(() => { setAt(0); track.current?.scrollTo({ left: 0 }); }, [srcs.length]);

  if (srcs.length === 0) return null;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(srcs.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (srcs.length === 1) {
    return (
      <div className={`overflow-hidden bg-slate-100 ${className}`}>
        <img src={srcs[0]} alt="" className="block w-full h-auto max-h-[80vh] object-contain mx-auto" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-900 group ${className}`}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-roledescription="carousel"
      >
        {srcs.map((s, i) => (
          <div key={s + i} className="relative w-full shrink-0 snap-center flex items-center justify-center overflow-hidden"
            aria-label={`Photo ${i + 1} of ${srcs.length}`}>
            {/* Photos differ in shape; the space around a shorter one is
                filled with a soft, blurred copy of itself, not black bars. */}
            <img src={s} alt="" aria-hidden draggable={false} loading={i === 0 ? 'eager' : 'lazy'}
              className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-70" />
            <img src={s} alt="" draggable={false} loading={i === 0 ? 'eager' : 'lazy'}
              className="relative block w-full h-auto max-h-[75vh] object-contain select-none" />
          </div>
        ))}
      </div>

      <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        {at + 1} / {srcs.length}
      </span>

      {at > 0 && (
        <button type="button" onClick={() => go(at - 1)} aria-label="Previous photo"
          className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition hover:bg-black/65">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {at < srcs.length - 1 && (
        <button type="button" onClick={() => go(at + 1)} aria-label="Next photo"
          className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition hover:bg-black/65">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
        {srcs.map((_, i) => (
          <button key={i} type="button" onClick={() => go(i)} aria-label={`Show photo ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === at ? 'w-4 bg-white' : 'w-1.5 bg-white/55'}`} />
        ))}
      </div>
    </div>
  );
}

/** Every photo of an event — the list, or the single cover from an older API. */
export const coverList = (e: { coverUrl: string | null; coverUrls?: string[] | null } | null | undefined): string[] =>
  !e ? [] : e.coverUrls && e.coverUrls.length ? e.coverUrls : e.coverUrl ? [e.coverUrl] : [];
