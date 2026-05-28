/**
 * Super Admin dashboard metrics — landing-page views + demo-account
 * logins. The track endpoint is intentionally anonymous; the summary
 * endpoint is gated on SUPER_ADMIN server-side.
 */
import { apiJson, apiVoid } from './client';

export interface DailyPoint {
  day: string;   // YYYY-MM-DD (UTC bucket)
  count: number;
}

export interface PlatformMetricsSummary {
  landingViewsTotal: number;
  landingViewsToday: number;
  demoLoginsTotal: number;
  demoLoginsToday: number;
  landingViewsDaily: DailyPoint[];
  demoLoginsDaily: DailyPoint[];
}

/** Fire-and-forget landing-page view. Called from LandingPage on mount;
 *  swallows errors so an outage on the metrics endpoint doesn't degrade
 *  the marketing page. */
export async function trackLandingView(): Promise<void> {
  try {
    await apiVoid('/api/v1/platform/track/landing-view', { method: 'POST' });
  } catch {
    // Best-effort: never surface a tracking error to the visitor.
  }
}

export async function getMetricsSummary(): Promise<PlatformMetricsSummary> {
  return apiJson('/api/v1/platform/metrics');
}
