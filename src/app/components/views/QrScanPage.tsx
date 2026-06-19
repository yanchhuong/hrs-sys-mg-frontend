import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CheckCircle2, AlertTriangle, Loader2, MapPin, QrCode as QrCodeIcon } from 'lucide-react';
import * as qrApi from '../../api/attendanceQr';

type Phase =
  | 'init'
  | 'no_token'
  | 'asking_location'
  | 'location_denied'
  | 'submitting'
  | 'need_emp_no'
  | 'success'
  | 'error';

/**
 * Public landing page the employee's phone opens after scanning the
 * QR with the camera app. Flow:
 *
 *   1. Read ?token=… off the URL. If missing → friendly error.
 *   2. Request geolocation (HTML5).
 *   3. POST to /attendance/qr/scan. If the user happens to be logged
 *      in on this device, the JWT rides along automatically and the
 *      backend resolves identity from there.
 *   4. If the API says "employee_unknown" → show an empNo entry
 *      field and resubmit. Same call, this time with empNo in the
 *      body.
 *
 * <p>No nav, no left menu — this is meant to be opened on a phone
 * by someone who isn't necessarily an HRMS user. Big text, big
 * buttons, no decorations.</p>
 */
export function QrScanPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [token, setToken] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [empNo, setEmpNo] = useState('');
  const [result, setResult] = useState<qrApi.ScanResult | null>(null);
  const [errMsg, setErrMsg] = useState<string>('');

  // Read token off the URL on mount. Any browser the camera opens
  // will already have ?token=… in the search string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') ?? '';
    if (!t) { setPhase('no_token'); return; }
    setToken(t);
    requestLocationAndSubmit(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestLocationAndSubmit = (tok: string) => {
    if (!navigator.geolocation) {
      setErrMsg('This browser blocks geolocation. Open the link in Chrome / Safari.');
      setPhase('error');
      return;
    }
    setPhase('asking_location');

    const submitWith = (pos: GeolocationPosition) => {
      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      };
      setCoords(c);
      void submit(tok, c, undefined);
    };
    const onError = (err: GeolocationPositionError) => {
      setErrMsg(err.code === err.PERMISSION_DENIED
        ? 'Location permission denied. Tap the lock icon in the address bar to allow it, then refresh.'
        : `Couldn't read location: ${err.message}`);
      setPhase('location_denied');
    };

    // Two-phase retry: try real GPS first (best accuracy for the
    // geofence check), fall back to WiFi/IP positioning if GPS
    // doesn't reply in 20s — common indoors and on desktops.
    // PERMISSION_DENIED is terminal; we don't retry that path.
    navigator.geolocation.getCurrentPosition(
      submitWith,
      hiAccErr => {
        if (hiAccErr.code === hiAccErr.PERMISSION_DENIED) {
          onError(hiAccErr);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          submitWith, onError,
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const submit = async (
    tok: string,
    c: { lat: number; lng: number; acc?: number },
    empNoOverride: string | undefined,
  ) => {
    setPhase('submitting');
    try {
      const res = await qrApi.scan({
        token: tok,
        latitude: c.lat,
        longitude: c.lng,
        accuracyMeters: c.acc,
        userAgent: navigator.userAgent,
        empNo: empNoOverride,
      });
      setResult(res);
      // Backend tells us the employee couldn't be resolved → show the
      // empNo fallback form. Anything else (success or hard failure)
      // is terminal for this scan.
      if (res.status === 'employee_unknown' && !empNoOverride) {
        setPhase('need_emp_no');
      } else if (res.status === 'checked_in' || res.status === 'checked_out' || res.status === 'duplicate') {
        setPhase('success');
      } else {
        setPhase('error');
        setErrMsg(res.message);
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Network error — try again.');
      setPhase('error');
    }
  };

  const resubmitWithEmpNo = () => {
    if (!coords) return;
    const n = empNo.trim();
    if (!n) return;
    void submit(token, coords, n);
  };

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCodeIcon className="h-6 w-6 text-blue-600" />
            <h1 className="text-lg font-semibold">QR Check-in</h1>
          </div>

          {phase === 'init' && (
            <p className="text-sm text-gray-500">Preparing…</p>
          )}

          {phase === 'no_token' && (
            <div className="text-center py-4">
              <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
              <p className="font-medium">No QR token in this link.</p>
              <p className="text-xs text-gray-500 mt-1">
                Scan the office QR with your phone camera to open the right link.
              </p>
            </div>
          )}

          {phase === 'asking_location' && (
            <div className="text-center py-4">
              <MapPin className="h-10 w-10 text-blue-500 mx-auto mb-2 animate-pulse" />
              <p className="font-medium">Allow location…</p>
              <p className="text-xs text-gray-500 mt-1">
                We use it once, to confirm you're at the office.
              </p>
            </div>
          )}

          {phase === 'submitting' && (
            <div className="text-center py-4">
              <Loader2 className="h-10 w-10 text-blue-500 mx-auto mb-2 animate-spin" />
              <p className="font-medium">Checking you in…</p>
            </div>
          )}

          {phase === 'location_denied' && (
            <div className="text-center py-4">
              <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
              <p className="font-medium">Location blocked</p>
              <p className="text-xs text-gray-500 mt-1">{errMsg}</p>
              <Button
                className="mt-4 w-full"
                onClick={() => requestLocationAndSubmit(token)}
              >
                Try again
              </Button>
            </div>
          )}

          {phase === 'need_emp_no' && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-gray-600">
                Couldn't identify you. Enter your Employee No. to check in.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Employee No.</Label>
                <Input
                  value={empNo}
                  onChange={e => setEmpNo(e.target.value)}
                  placeholder="EMP-001"
                  inputMode="text"
                  autoCapitalize="characters"
                />
              </div>
              <Button
                className="w-full"
                disabled={!empNo.trim()}
                onClick={resubmitWithEmpNo}
              >
                Check in
              </Button>
            </div>
          )}

          {phase === 'success' && result && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
              <p className="text-lg font-semibold">
                {result.status === 'duplicate' ? 'Already checked in' : 'Success'}
              </p>
              <p className="text-sm text-gray-700 mt-1">{result.message}</p>
              {result.employeeName && (
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, {result.employeeName}
                </p>
              )}
              {result.officeName && (
                <p className="text-[11px] text-gray-400 mt-0.5 inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {result.officeName}
                  {result.distanceMeters != null
                    && ` · ${Math.round(result.distanceMeters)}m away`}
                </p>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="text-center py-4">
              <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto mb-2" />
              <p className="font-medium">Couldn't check you in</p>
              <p className="text-xs text-gray-500 mt-1">{errMsg}</p>
              <Button
                className="mt-4 w-full" variant="outline"
                onClick={() => window.location.reload()}
              >
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
