import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Printer, RefreshCw, Loader2, QrCode as QrCodeIcon, MapPin } from 'lucide-react';
import * as officesApi from '../../api/offices';
import * as qrApi from '../../api/attendanceQr';

/**
 * Admin's daily-QR display. Pick an office → backend issues (or
 * returns) today's token → page renders the QR pixels at print
 * resolution. The "Print" button triggers the browser's print
 * dialog so HR can stick the printout on the office door, or you
 * can put this page fullscreen on a monitor in the lobby.
 *
 * <p>The QR encodes a URL like {@code https://your-app/scan?token=…}.
 * Anyone with a phone camera scans it and gets dropped on the
 * employee-facing scan page — no app install needed.</p>
 */
export function QrDisplay() {
  const [offices, setOffices] = useState<officesApi.Office[]>([]);
  const [officeId, setOfficeId] = useState<string>('');
  const [today, setToday] = useState<qrApi.TodayToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initial — load offices, auto-select the first enabled one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await officesApi.list();
        if (cancelled) return;
        setOffices(list);
        const firstActive = list.find(o => o.enabled);
        if (firstActive) setOfficeId(firstActive.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load offices');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Whenever the picked office changes, fetch today's token + render
  // the QR. Idempotent on the API side — refresh just returns the
  // existing token if one was already minted today.
  useEffect(() => {
    if (!officeId) return;
    void issueAndRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  const issueAndRender = async () => {
    setIssuing(true);
    try {
      const t = await qrApi.getToday(officeId);
      setToday(t);
      if (canvasRef.current) {
        // High error-correction so a printout with a coffee stain or
        // bent corner still scans. 512px canvas gives a crisp image
        // when displayed on a 1080p monitor; print scales it.
        await QRCode.toCanvas(canvasRef.current, t.scanUrl, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to issue today\'s QR');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold inline-flex items-center gap-2">
          <QrCodeIcon className="h-7 w-7 text-blue-600" />
          QR Display
        </h1>
        <div className="flex items-center gap-2">
          <Select value={officeId} onValueChange={setOfficeId} disabled={loading || offices.length === 0}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Pick an office" />
            </SelectTrigger>
            <SelectContent>
              {offices.map(o => (
                <SelectItem key={o.id} value={o.id} disabled={!o.enabled}>
                  {o.name}{!o.enabled && ' (disabled)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={issueAndRender} disabled={issuing || !officeId}>
            {issuing
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
          <Button onClick={() => window.print()} disabled={!today}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : offices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            No offices configured yet. Go to <strong>Offices</strong> to add one.
          </CardContent>
        </Card>
      ) : !officeId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            Pick an office above to see today's QR.
          </CardContent>
        </Card>
      ) : (
        <Card className="print:shadow-none print:border-0">
          <CardHeader className="print:py-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              {today?.officeName ?? '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-8 print:py-4">
            <canvas
              ref={canvasRef}
              className="rounded-md shadow-sm border bg-white"
            />
            <div className="text-center">
              <p className="text-sm font-medium">Scan with your phone camera to check in</p>
              {today && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Valid for {today.tokenDate} · within {today.radiusMeters}m of this office
                </p>
              )}
            </div>
            {today && (
              <p className="text-[10px] font-mono text-gray-300 break-all max-w-md text-center">
                {today.scanUrl}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Print-only spacing tweaks so the QR centres on an A4 page. */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:py-2 { padding-top: .5rem; padding-bottom: .5rem; }
          .print\\:py-4 { padding-top: 1rem; padding-bottom: 1rem; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-0 { border: 0 !important; }
        }
      `}</style>
    </div>
  );
}
