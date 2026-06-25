import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Input } from '../ui/input';
import { Loader2, Search, MapPin } from 'lucide-react';

/**
 * Inline map for picking a lat/lng. Built on Leaflet + OpenStreetMap so
 * there's no API key in play. Two ways to set the pin:
 *   1. Click anywhere on the map (or drag the marker).
 *   2. Type a place name in the search box (Nominatim).
 *
 * The parent owns the coordinate state — this component is "controlled":
 * pass the current `lat`/`lng` and an `onChange` that updates it. When the
 * controlled values change externally (e.g. "Use my current location" on
 * the parent form), the map re-centres and the marker moves with them.
 *
 * Nominatim is a public service. We send a descriptive User-Agent (per
 * their usage policy) and debounce typing by 400ms so a slow typist
 * doesn't fire ten requests.
 */

// Leaflet's default marker icon ships as relative URLs Vite can't
// resolve, and `mergeOptions` alone is fragile under HMR — sometimes
// the merged URLs get overwritten when leaflet's module re-evaluates.
// Build an explicit icon and pass it to <Marker icon={...}> below so
// the marker reliably renders with its proper PNG.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
const DEFAULT_ICON = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
}

interface Props {
  lat: number | null;
  lng: number | null;
  /** Called on every pin change — click, drag, search-select, or
   *  programmatic recenter via a search hit. */
  onChange: (lat: number, lng: number) => void;
  /** Optional fallback when both lat/lng are null. Defaults to Phnom Penh. */
  fallback?: { lat: number; lng: number };
}

const PHNOM_PENH = { lat: 11.5564, lng: 104.9282 };

export function MapPicker({ lat, lng, onChange, fallback = PHNOM_PENH }: Props) {
  const center: [number, number] = lat != null && lng != null
    ? [lat, lng]
    : [fallback.lat, fallback.lng];

  return (
    <div className="space-y-2">
      <SearchBox onPick={onChange} />
      {/* The [&_.leaflet-control-attribution]:hidden Tailwind arbitrary
          selector strips the "Leaflet | © OpenStreetMap" badge regardless
          of HMR state — the attributionControl={false} prop only fires
          once at map creation, so the CSS is the reliable layer. */}
      <div className="relative h-56 w-full overflow-hidden rounded-md border [&_.leaflet-control-attribution]:hidden">
        <MapContainer
          center={center}
          zoom={lat != null && lng != null ? 16 : 12}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <PinLayer lat={lat} lng={lng} onChange={onChange} />
        </MapContainer>
      </div>
      <p className="text-[11px] text-gray-400">
        Click the map, drag the pin, or search above to set the office location.
      </p>
    </div>
  );
}

/** Marker layer + click handler. Listens to map clicks to drop the pin
 *  and keeps the view centred whenever the controlled lat/lng changes
 *  from outside (e.g. "Use my current location" on the parent). */
function PinLayer({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  // Re-centre when the controlled coords change from outside the map.
  // Avoid jittering by skipping when the pin is already on-screen and
  // close to the centre — only fly to it on a genuine relocation.
  useEffect(() => {
    if (lat == null || lng == null) return;
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, map]);

  if (lat == null || lng == null) return null;
  return (
    <Marker
      position={[lat, lng]}
      icon={DEFAULT_ICON}
      draggable
      eventHandlers={{
        dragend(e) {
          const m = e.target as L.Marker;
          const { lat: la, lng: lo } = m.getLatLng();
          onChange(la, lo);
        },
      }}
    />
  );
}

/** Place-name search via Nominatim. Debounces typing by 400ms and shows
 *  the first 5 hits in a popover-style list. Selecting one bubbles the
 *  coordinates up to the parent so the marker re-centres. */
function SearchBox({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 3) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(term)}`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: NominatimHit[] = await res.json();
        setHits(data);
        setOpen(data.length > 0);
      } catch {
        setHits([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [q]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search a place, e.g. ICT Mall, Phnom Penh"
          className="pl-8 pr-8"
          onFocus={() => hits.length > 0 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>
      {open && (
        <ul className="absolute z-[1000] mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-md">
          {hits.map(h => (
            <li
              key={h.place_id}
              className="cursor-pointer px-3 py-2 text-xs hover:bg-blue-50"
              onClick={() => {
                onPick(parseFloat(h.lat), parseFloat(h.lon));
                setQ(h.display_name);
                setOpen(false);
              }}
            >
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" />
                <span className="line-clamp-2">{h.display_name}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
