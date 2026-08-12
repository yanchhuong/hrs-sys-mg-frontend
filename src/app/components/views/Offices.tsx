import { useEffect, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Plus, Pencil, Trash2, MapPin, Loader2, QrCode } from 'lucide-react';
import * as officesApi from '../../api/offices';
import { QrDisplayDialog } from '../common/QrDisplayDialog';
// v-perf-lazy-map — leaflet + react-leaflet weigh ~250KB gz. Only
// paid when the operator opens the office-edit dialog with the
// map picker inside; the office list itself never loads it.
const MapPicker = lazy(() =>
  import('../common/MapPicker').then(m => ({ default: m.MapPicker })),
);
import { TableRowsSkeleton } from '../common/LoadingSkeletons';

interface FormState {
  id?: string;
  name: string;
  latitude: string;       // text inputs — coerced on submit so partial typing is fine
  longitude: string;
  radiusMeters: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  latitude: '',
  longitude: '',
  radiusMeters: '100',
  enabled: true,
};

interface Props {
  /** When true, skip the outer page-level h1 + "Add Office" header
   *  — the component is being rendered inside a Dialog whose own
   *  header carries the title. Lets the same component back both
   *  the standalone view and the Attendance-page "Manage Offices"
   *  popup without duplication. */
  embedded?: boolean;
}

/**
 * Office locations CRUD. Each row carries the geofence the
 * QR-attendance scan validates against — lat/lng + radius. Admin sets
 * one or many per tenant.
 */
export function Offices({ embedded = false }: Props = {}) {
  const [rows, setRows] = useState<officesApi.Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<officesApi.Office | null>(null);
  // QR popup state — drives the per-row "View QR" column. Tracking
  // the officeId separately from the open flag means closing the
  // dialog clears the id, so a second-open for the same office still
  // re-fetches the token (cheap idempotent API call).
  const [qrOfficeId, setQrOfficeId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await officesApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load offices');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (o: officesApi.Office) => {
    setForm({
      id: o.id,
      name: o.name,
      latitude: String(o.latitude),
      longitude: String(o.longitude),
      radiusMeters: String(o.radiusMeters),
      enabled: o.enabled,
    });
    setDialogOpen(true);
  };

  /** "Use my location" — pulls the admin's current coords so they
   *  don't have to look up office lat/lng manually. Two-phase
   *  retry: first try high-accuracy (real GPS) with a 20s window;
   *  if that times out (common on desktops with no GPS hardware),
   *  fall back to WiFi/IP-based positioning which is coarse but
   *  fast. Either is good enough for setting an office geofence —
   *  the admin can fine-tune the digits after either path lands. */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Browser geolocation is not available (HTTPS required).');
      return;
    }
    const ok = (pos: GeolocationPosition) => {
      setForm(prev => ({
        ...prev,
        latitude:  pos.coords.latitude.toFixed(7),
        longitude: pos.coords.longitude.toFixed(7),
      }));
      toast.success(`Location captured (~${Math.round(pos.coords.accuracy)}m accuracy).`);
    };
    const fallback = (highAccErr: GeolocationPositionError) => {
      // PERMISSION_DENIED (1) is terminal — don't bother retrying.
      if (highAccErr.code === highAccErr.PERMISSION_DENIED) {
        toast.error('Location permission denied. Allow it in the address-bar lock icon.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ok,
        err => toast.error(`Couldn't read location: ${err.message}`),
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    };
    navigator.geolocation.getCurrentPosition(
      ok, fallback,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const radius = parseInt(form.radiusMeters, 10) || 100;
    if (!name) { toast.error('Name is required'); return; }
    if (!Number.isFinite(lat) || lat < -90  || lat > 90)  { toast.error('Latitude must be between -90 and 90'); return; }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { toast.error('Longitude must be between -180 and 180'); return; }

    setSaving(true);
    try {
      const payload: officesApi.OfficeWriteRequest = {
        name, latitude: lat, longitude: lng,
        radiusMeters: radius, enabled: form.enabled,
      };
      if (form.id) await officesApi.update(form.id, payload);
      else         await officesApi.create(payload);
      toast.success(form.id ? 'Office updated' : 'Office created');
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await officesApi.remove(deleteTarget.id);
      toast.success(`Removed ${deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {/* Standalone-view page header. In embedded mode the parent
       *  Dialog already renders the title; the Add Office button now
       *  lives inside the Card header (matches the Devices tab UI). */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Offices</h1>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            Locations
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Office
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableRowsSkeleton rows={6} columns={5} />
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              No offices yet. Click <strong>Add Office</strong> to create the first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead className="text-center">Radius</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">View QR</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="tabular-nums text-xs text-gray-600">
                      {o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}
                    </TableCell>
                    <TableCell className="text-center text-sm">{o.radiusMeters}m</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={o.enabled ? 'default' : 'outline'}>
                        {o.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    {/* Per-row QR launcher. Disabled when the office
                        itself is disabled — the backend would 400 the
                        scan anyway, and the dimmed button telegraphs
                        that. */}
                    <TableCell className="text-center">
                      <Button
                        size="sm" variant="outline" className="h-7 px-2"
                        disabled={!o.enabled}
                        onClick={() => setQrOfficeId(o.id)}
                        title={o.enabled ? "Today's QR" : 'Enable this office to mint a QR'}
                      >
                        <QrCode className="h-3.5 w-3.5 mr-1" />
                        <span className="text-xs">View</span>
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7"
                          onClick={() => openEdit(o)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(o)}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit office' : 'Add office'}</DialogTitle>
            <DialogDescription className="sr-only">
              Set the office's coordinates and geofence radius. The QR
              scan will only succeed within this radius.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Main Office"
                maxLength={79}
              />
            </div>

            {/* Map picker — click / drag / search to set coordinates.
                Stays in sync with the lat/lng text inputs below so an
                admin who already knows the exact numbers can still type
                them in.
                v-perf-lazy-map — Suspense keeps leaflet out of the
                initial bundle; fallback is a placeholder so the form
                doesn't jump when the chunk lands. */}
            <Suspense fallback={<div className="h-64 rounded-md border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400">Loading map…</div>}>
              <MapPicker
                lat={parseFloat(form.latitude) || null}
                lng={parseFloat(form.longitude) || null}
                onChange={(la, lo) => setForm(prev => ({
                  ...prev,
                  latitude:  la.toFixed(7),
                  longitude: lo.toFixed(7),
                }))}
              />
            </Suspense>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Latitude</Label>
                <Input
                  value={form.latitude}
                  onChange={e => setForm({ ...form, latitude: e.target.value })}
                  placeholder="11.5564"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Longitude</Label>
                <Input
                  value={form.longitude}
                  onChange={e => setForm({ ...form, longitude: e.target.value })}
                  placeholder="104.9282"
                  inputMode="decimal"
                />
              </div>
            </div>
            <Button
              type="button" variant="outline" size="sm"
              className="w-full"
              onClick={useMyLocation}
            >
              <MapPin className="h-3.5 w-3.5 mr-1.5" />
              Use my current location
            </Button>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Radius (meters)</Label>
              <Input
                type="number"
                min={5}
                max={5000}
                value={form.radiusMeters}
                onChange={e => setForm({ ...form, radiusMeters: e.target.value })}
              />
              <p className="text-[11px] text-gray-400">
                Scan must land within this many meters. 50–200m typical for a single building.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Label>Enabled</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={v => setForm({ ...form, enabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {form.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this office?</AlertDialogTitle>
            <AlertDialogDescription>
              All QR tokens issued for {deleteTarget?.name} will be invalidated.
              Existing attendance rows that reference this office stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Today's QR popup — drives the per-row "View" button. Stays
          mounted across opens so the parent table doesn't unmount /
          remount the table state. */}
      <QrDisplayDialog
        open={!!qrOfficeId}
        onOpenChange={v => !v && setQrOfficeId(null)}
        officeId={qrOfficeId}
      />
    </div>
  );
}
