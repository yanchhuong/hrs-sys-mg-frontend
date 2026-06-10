import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { format as fnsFormat } from 'date-fns';
import * as settingsApi from '../api/settings';
import { useAuth } from './AuthContext';

/**
 * Tenant-configurable date display preference (V60). The provider loads
 * the pattern once per authenticated session from `company_info.date_format`
 * and exposes:
 *   - `pattern`: the raw date-fns string (mostly read by the Settings
 *     dropdown to highlight the current preset).
 *   - `formatDate(d)`: renders a Date / ISO-string with the configured
 *     pattern. Skips parse failures gracefully.
 *   - `formatDateTime(d)`: same date pattern with " HH:mm" appended for
 *     timestamp columns (Submitted At, Updated At, etc.).
 *   - `refresh()`: re-fetch — called from the Settings page after the
 *     admin saves a new pattern so other open tabs flip immediately.
 *
 * Defaults to `MMM dd, yyyy` (the historic hardcoded value) so the app
 * stays usable while the GET is in flight or for users without a
 * loaded auth session yet (landing page, login).
 */
export const DEFAULT_DATE_FORMAT = 'MMM dd, yyyy';

/** Curated preset list — matches the backend's validation note in V60.
 *  Surfaces in the Settings dropdown; the field is free-form on the
 *  wire so a tenant could pick something else, but the UI only offers
 *  these to keep payslip rendering predictable. */
export const DATE_FORMAT_PRESETS: ReadonlyArray<{ label: string; pattern: string }> = [
  { label: 'May 20, 2026',   pattern: 'MMM dd, yyyy' },
  { label: '20 May 2026',    pattern: 'dd MMM yyyy' },
  { label: '20/05/2026',     pattern: 'dd/MM/yyyy' },
  { label: '05/20/2026',     pattern: 'MM/dd/yyyy' },
  { label: '2026-05-20',     pattern: 'yyyy-MM-dd' },
  { label: '20-05-2026',     pattern: 'dd-MM-yyyy' },
];

interface DateFormatContextValue {
  pattern: string;
  formatDate: (d: Date | string | number | null | undefined) => string;
  formatDateTime: (d: Date | string | number | null | undefined) => string;
  refresh: () => Promise<void>;
}

const DateFormatContext = createContext<DateFormatContextValue | null>(null);

/** Coerce any of {Date, ISO string, epoch ms} to a Date or null. Returns
 *  null on parse failure so call sites can show a dash instead of
 *  exploding with RangeError. */
function toDate(d: Date | string | number | null | undefined): Date | null {
  if (d == null || d === '') return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [pattern, setPattern] = useState<string>(DEFAULT_DATE_FORMAT);

  const load = useCallback(async () => {
    // Only call the tenant-scoped endpoint when there's an authenticated
    // session. Pre-login (Landing / Login pages) we fall back to the
    // default — no point hitting /settings/company with no JWT.
    if (!currentUser) {
      setPattern(DEFAULT_DATE_FORMAT);
      return;
    }
    // Super admins operate on the platform surface; /settings/company is
    // tenant-scoped and 403s for them. Keep the default pattern instead
    // of logging a spurious permission error.
    if (currentUser.role === 'super_admin') {
      setPattern(DEFAULT_DATE_FORMAT);
      return;
    }
    try {
      const info = await settingsApi.getCompanyInfo();
      const next = (info as { dateFormat?: string }).dateFormat;
      if (next && next.trim()) setPattern(next.trim());
      else setPattern(DEFAULT_DATE_FORMAT);
    } catch {
      // Settings GET can 401 right after logout or 500 in dev — silently
      // keep the previous (or default) pattern so the UI stays usable.
      // Errors surface via the actual Settings page when the admin opens
      // it; no need to toast on every read here.
      setPattern(prev => prev || DEFAULT_DATE_FORMAT);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<DateFormatContextValue>(() => {
    const formatDate = (d: Date | string | number | null | undefined): string => {
      const parsed = toDate(d);
      if (!parsed) return '—';
      try { return fnsFormat(parsed, pattern); }
      catch { return fnsFormat(parsed, DEFAULT_DATE_FORMAT); }
    };
    const formatDateTime = (d: Date | string | number | null | undefined): string => {
      const parsed = toDate(d);
      if (!parsed) return '—';
      try { return fnsFormat(parsed, `${pattern} HH:mm`); }
      catch { return fnsFormat(parsed, `${DEFAULT_DATE_FORMAT} HH:mm`); }
    };
    return { pattern, formatDate, formatDateTime, refresh: load };
  }, [pattern, load]);

  return <DateFormatContext.Provider value={value}>{children}</DateFormatContext.Provider>;
}

/**
 * Hook for any view that renders a visible date. Use {@link formatDate}
 * for plain dates (table cells, headers) and {@link formatDateTime} for
 * timestamps. Date inputs (`<input type="date">`) and API params still
 * use the canonical `yyyy-MM-dd`; don't route those through here.
 */
export function useDateFormat(): DateFormatContextValue {
  const ctx = useContext(DateFormatContext);
  if (!ctx) {
    // Outside the provider (Landing page renders before AuthProvider) —
    // serve a stub so consumers don't need null-checks. Real pages live
    // inside AppContent which is wrapped by DateFormatProvider.
    return {
      pattern: DEFAULT_DATE_FORMAT,
      formatDate: (d) => {
        const parsed = toDate(d);
        return parsed ? fnsFormat(parsed, DEFAULT_DATE_FORMAT) : '—';
      },
      formatDateTime: (d) => {
        const parsed = toDate(d);
        return parsed ? fnsFormat(parsed, `${DEFAULT_DATE_FORMAT} HH:mm`) : '—';
      },
      refresh: async () => {},
    };
  }
  return ctx;
}
