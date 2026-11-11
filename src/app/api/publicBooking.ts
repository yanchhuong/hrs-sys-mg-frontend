/**
 * Public booking page (v-booking-public-link, V406). Two surfaces:
 *  - Admin-side: get / rotate / enable the tenant's 5-char code, set the
 *    banner wording, choose which properties the page publishes.
 *  - Anonymous: resolve a code → what the tenant publishes, and what is
 *    free for a given stay.
 *
 * The page calls {@link getPublicPage} and {@link getAvailability} with
 * no auth header — the code is the entire secret, exactly as on
 * /shop/{code}.
 */
import { apiJson } from './client';

/* ----------------------------- admin ----------------------------- */

export interface BookingLinkInfo {
  code: string;
  enabled: boolean;
  /** Off: the page still shows rooms and availability, but takes no
   *  requests. Independent of {@link enabled}. */
  requestsEnabled: boolean;
  headline: string | null;
  tagline: string | null;
  coverUrl: string | null;
  /** Full shareable URL, or null when the API has no PUBLIC_BASE_URL
   *  and the caller should compose it from the browser origin. */
  url: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  /** Properties published on the page, in page order. */
  publishedItemIds: string[];
  /** Published by the tenant but not shown on the page: priced by the
   *  hour or per booking, which the page cannot sell yet. */
  unsupportedItemIds: string[];
}

export async function getBookingLink(): Promise<BookingLinkInfo> {
  return apiJson('/api/v1/booking-link');
}

/** Mint a fresh code. Every shared link and printed QR for the old one
 *  dies immediately — for a genuine leak, not for tidying up. */
export async function rotateBookingLink(): Promise<BookingLinkInfo> {
  return apiJson('/api/v1/booking-link/rotate', { method: 'POST' });
}

export async function setBookingLinkEnabled(enabled: boolean): Promise<BookingLinkInfo> {
  return apiJson(`/api/v1/booking-link/enabled?value=${enabled}`, { method: 'POST' });
}

export async function setBookingRequestsEnabled(enabled: boolean): Promise<BookingLinkInfo> {
  return apiJson(`/api/v1/booking-link/requests-enabled?value=${enabled}`, { method: 'POST' });
}

export async function setBookingLinkBranding(
  body: { headline?: string | null; tagline?: string | null; coverUrl?: string | null },
): Promise<BookingLinkInfo> {
  return apiJson('/api/v1/booking-link/branding', { method: 'PUT', json: body });
}

/** Replace the published properties, in the order the page shows them. */
export async function publishBookingProperties(itemIds: string[]): Promise<BookingLinkInfo> {
  return apiJson('/api/v1/booking-link/properties', { method: 'PUT', json: { itemIds } });
}

/* --------------------------- anonymous --------------------------- */

/**
 * A bookable category and what's left of it.
 *
 * `id` is an option-group id (the room type), or — when the property
 * has no groups — the option's own id, so a small guesthouse that never
 * set groups up still gets a working page.
 */
/** V408 price_unit, per property. */
export type RateUnit = 'night' | 'hour' | 'booking';

export interface RoomType {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** People it takes. Null when the tenant never filled it in, in
   *  which case the page shows the room rather than hiding it. */
  capacity: number | null;
  /** Cheapest available unit's price, per {@link rateUnit}. Null when
   *  no unit carries one. */
  rate: number | null;
  /** What the rate is per. Only 'night' reaches this page today; named
   *  rather than assumed so hourly stays become a UI change and not a
   *  change to a shipped contract. */
  rateUnit: RateUnit;
  /** rate × periods. Null on the dateless page. */
  total: number | null;
  availableUnits: number;
  totalUnits: number;
}

export interface PublicProperty {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string;
  priceUnit: RateUnit;
  roomTypes: RoomType[];
}

export interface PublicBookingPayload {
  code: string;
  headline: string;
  tagline: string | null;
  coverUrl: string | null;
  companyName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  requestsEnabled: boolean;
  properties: PublicProperty[];
}

export interface AvailabilityPayload {
  code: string;
  checkIn: string;
  /** Exclusive — a guest leaving on the 12th and one arriving on the
   *  12th do not clash. */
  checkOut: string;
  /** How many rate units the stay covers — nights today. */
  periods: number;
  guests: number;
  requestsEnabled: boolean;
  properties: PublicProperty[];
}

/** The page itself, before any dates are picked. */
export async function getPublicPage(code: string): Promise<PublicBookingPayload> {
  return apiJson(`/api/v1/public/booking/${encodeURIComponent(code)}`, { auth: false });
}

/** What is free for a stay. `checkOut` is exclusive. Both dates are
 *  ISO `YYYY-MM-DD` in the company's local days. */
export async function getAvailability(
  code: string,
  checkIn: string,
  checkOut: string,
  guests?: number,
): Promise<AvailabilityPayload> {
  return apiJson(`/api/v1/public/booking/${encodeURIComponent(code)}/availability`, {
    auth: false,
    query: { checkIn, checkOut, guests: guests && guests > 0 ? guests : undefined },
  });
}
