import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { LogIn, LogOut, MapPin, Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import * as meApi from '../../api/attendanceMe';

type Coords = { lat: number; lng: number; acc?: number };
type LocState =
  | { tag: 'idle' }            // not yet asked
  | { tag: 'asking' }          // permission prompt up
  | { tag: 'denied'; msg: string }
  | { tag: 'unavailable'; msg: string }
  | { tag: 'ok'; coords: Coords };

/**
 * Top-bar self check-in / check-out pill. Wakes up after login,
 * asks for location once, then talks to /api/v1/attendance/me/* to
 * figure out which button to show (Check-In or Check-Out) based
 * on (a) whether the employee's coords are inside any office
 * geofence and (b) whether they've already punched today.
 *
 * <p>State machine:</p>
 * <pre>
 *   geolocation:  idle → asking → ok / denied / unavailable
 *   server:       loading → pending / checked_in / checked_out /
 *                           out_of_range / no_offices
 * </pre>
 *
 * <p>Renders nothing when location is denied or unavailable — no
 * point shouting "Allow location" forever in the top bar; the
 * employee can refresh the page to re-prompt.</p>
 */
export function AttendanceCheckInWidget() {
  const [loc, setLoc]       = useState<LocState>({ tag: 'idle' });
  const [status, setStatus] = useState<meApi.CheckStatus | null>(null);
  const [busy, setBusy]     = useState(false);

  // ── 1. Ask for location once on mount ─────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setLoc({ tag: 'unavailable', msg: 'Geolocation unavailable.' });
      return;
    }
    setLoc({ tag: 'asking' });
    const submitOK = (pos: GeolocationPosition) => setLoc({
      tag: 'ok',
      coords: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      },
    });
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setLoc({ tag: 'denied', msg: 'Location permission denied.' });
      } else {
        setLoc({ tag: 'unavailable', msg: err.message });
      }
    };
    // Same two-phase retry as the QR scan page — try GPS first, then
    // fall back to WiFi/IP positioning. Indoor desktops can't see
    // satellites and would otherwise timeout silently.
    navigator.geolocation.getCurrentPosition(
      submitOK,
      hiAccErr => {
        if (hiAccErr.code === hiAccErr.PERMISSION_DENIED) return onError(hiAccErr);
        navigator.geolocation.getCurrentPosition(
          submitOK, onError,
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }, []);

  // ── 2. Probe server for status whenever we have fresh coords ──
  useEffect(() => {
    if (loc.tag !== 'ok') return;
    let cancelled = false;
    meApi.checkStatus(loc.coords.lat, loc.coords.lng)
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => {
        // Silent — the widget is best-effort. A failed status probe
        // shouldn't toast at the user; the next page load retries.
      });
    return () => { cancelled = true; };
  }, [loc]);

  // ── 3. Click handlers — re-fetch coords each time so a stale
  //      position from 5 minutes ago doesn't let an off-site click
  //      through. ─────────────────────────────────────────────────
  const punch = async (action: 'in' | 'out') => {
    if (loc.tag !== 'ok') return;
    setBusy(true);
    try {
      // Refresh coords first (best-accuracy, 8s) so an old reading
      // from when the widget mounted doesn't authorise an off-site
      // punch. Falls back to the previously-captured coords if the
      // refresh fails — server will reject if truly out of range.
      const fresh = await new Promise<Coords>(resolve => {
        if (!navigator.geolocation) return resolve(loc.coords);
        navigator.geolocation.getCurrentPosition(
          pos => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
          }),
          () => resolve(loc.coords),
          { enableHighAccuracy: true, timeout: 8_000, maximumAge: 5_000 },
        );
      });
      setLoc({ tag: 'ok', coords: fresh });
      const next = action === 'in'
        ? await meApi.checkIn(fresh.lat, fresh.lng)
        : await meApi.checkOut(fresh.lat, fresh.lng);
      setStatus(next);
      if (next.phase === 'checked_in' || next.phase === 'checked_out') {
        toast.success(next.message);
        // Signal any open Attendance page to refetch — the new row
        // should appear in the grid immediately, not on the next
        // manual reload. Custom DOM event keeps the widget +
        // Attendance page decoupled (no shared context).
        window.dispatchEvent(new CustomEvent('attendance:punched', {
          detail: { phase: next.phase },
        }));
      } else {
        toast.error(next.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Punch failed');
    } finally {
      setBusy(false);
    }
  };

  // ── render ────────────────────────────────────────────────────
  if (loc.tag === 'idle' || loc.tag === 'asking') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Locating…
      </div>
    );
  }
  if (loc.tag === 'denied' || loc.tag === 'unavailable') {
    // Quiet failure mode — show a small disabled hint instead of
    // nothing, so the user knows the widget exists and that GPS is
    // the blocker. Hovering shows the reason.
    return (
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-400 text-xs cursor-help">
              <Ban className="h-3.5 w-3.5" />
              Location off
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {loc.msg} Tap the lock icon in your browser's address bar to allow location, then refresh.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (!status) {
    return null; // first status probe still flying
  }

  if (status.phase === 'no_offices') {
    return null; // tenant hasn't set this up — don't pollute the bar
  }

  if (status.phase === 'out_of_range') {
    return (
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs cursor-help">
              <MapPin className="h-3.5 w-3.5" />
              Off-site
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {status.message}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status.phase === 'checked_out') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
        <LogOut className="h-3.5 w-3.5" />
        Done · {status.checkInTime ?? '—'} → {status.checkOutTime ?? '—'}
      </div>
    );
  }

  // Switch-style button — only one visible at a time. Pending →
  // Check-In; Checked-in → Check-Out.
  const isCheckIn = status.phase === 'pending';
  return (
    <Button
      size="sm"
      onClick={() => punch(isCheckIn ? 'in' : 'out')}
      disabled={busy}
      className={isCheckIn
        ? 'bg-blue-600 hover:bg-blue-700 text-white'
        : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
      title={status.officeName
        ? `${status.officeName} · ${Math.round(status.distanceMeters ?? 0)}m away`
        : undefined}
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        : (isCheckIn ? <LogIn className="h-3.5 w-3.5 mr-1.5" /> : <LogOut className="h-3.5 w-3.5 mr-1.5" />)}
      {isCheckIn ? 'Check-In' : 'Check-Out'}
    </Button>
  );
}
