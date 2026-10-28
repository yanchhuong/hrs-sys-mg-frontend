/**
 * Open intent — "switch to view X and open record Y".
 *
 * The web app routes by view id, not URL, so a notification (or any
 * other cross-page link) can switch the view but had no way to say which
 * row to open once it got there. The caller records the intent and then
 * switches view; the target page consumes it with {@link useOpenIntent}
 * and opens its own detail dialog for that id.
 *
 * One pending intent at a time; it is consumed on first read so a later
 * visit to the same page doesn't re-open the record. An intent nobody
 * consumes within a minute is dropped.
 */
import { useEffect } from 'react';

interface Intent { view: string; id: string; at: number }

let pending: Intent | null = null;
const EVENT = 'hrms:open-intent';
const TTL_MS = 60_000;

export function setOpenIntent(view: string, id: string): void {
  pending = { view, id, at: Date.now() };
  // A page that is already mounted (same view) hears it right away.
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Take the pending id for {@code view}, if any (and clear it). */
export function takeOpenIntent(view: string): string | null {
  if (!pending || pending.view !== view) return null;
  if (Date.now() - pending.at > TTL_MS) { pending = null; return null; }
  const id = pending.id;
  pending = null;
  return id;
}

/**
 * Page side: call {@code open(id)} when an intent for {@code view} is
 * pending on mount, or arrives while mounted.
 */
export function useOpenIntent(view: string, open: (id: string) => void): void {
  useEffect(() => {
    const check = () => {
      const id = takeOpenIntent(view);
      if (id) open(id);
    };
    check();
    window.addEventListener(EVENT, check);
    return () => window.removeEventListener(EVENT, check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
}
