import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getActiveClientTenant, setActiveClientTenant } from '../api/client';
import * as agencyApi from '../api/agency';
import { useAuth } from './AuthContext';

/**
 * v-agency-mvp-1c-ii client-side plumbing.
 *
 * <p>Agency users work across many client Companies. Every tenant
 * data-plane call the agency makes needs a {@code X-Client-Tenant}
 * header naming the active client (see
 * {@code AgencyClientContextFilter} on the backend). This context
 * owns the "currently picked" client + the agency user's portfolio,
 * so the header wiring lives in one place and any FE component can
 * read/change the pick without prop-drilling.</p>
 *
 * <p>Non-agency users never open this context; the hook returns
 * a benign default with an empty portfolio.</p>
 */
export interface AgencyClient extends agencyApi.AgencyClient {}

interface AgencyClientContextType {
  /** Portfolio hydrated from /api/v1/agency/me. Empty for non-agency
   *  users OR while the initial fetch is in flight. */
  portfolio: AgencyClient[];
  /** The client currently pinned as X-Client-Tenant. Null when
   *  nothing is picked or the caller isn't an agency user. */
  activeClientId: string | null;
  activeClient: AgencyClient | null;
  /** Set the pick — writes both to the module-level header slot
   *  (drives every subsequent apiFetch) and localStorage (survives
   *  reload). Passing null clears the pick. */
  setActiveClient: (tenantId: string | null) => void;
  /** True while the initial /agency/me fetch is running. */
  loading: boolean;
  /** Force a re-hydrate of /agency/me — e.g. after Super Admin
   *  disengages a client on the agency's portfolio. */
  refresh: () => Promise<void>;
}

const AgencyClientContext = createContext<AgencyClientContextType>({
  portfolio: [],
  activeClientId: null,
  activeClient: null,
  setActiveClient: () => {},
  loading: false,
  refresh: async () => {},
});

export function AgencyClientProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const isAgency = !!currentUser?.role && currentUser.role.startsWith('agency_');

  const [portfolio, setPortfolio] = useState<AgencyClient[]>([]);
  const [activeClientId, setActiveClientIdState] = useState<string | null>(getActiveClientTenant());
  const [loading, setLoading] = useState(false);

  // Sync module-level header + localStorage on pick change.
  const setActiveClient = useCallback((tenantId: string | null) => {
    setActiveClientTenant(tenantId);
    setActiveClientIdState(tenantId);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAgency) return;
    setLoading(true);
    try {
      const res = await agencyApi.me();
      setPortfolio(res.portfolio);
      // If the previously-picked client is no longer in portfolio
      // (agency was disengaged), clear the pick so downstream calls
      // don't 403 with "NoActiveEngagement". If the portfolio has
      // exactly one client and nothing was picked yet, auto-pick.
      const stillEngaged = activeClientId && res.portfolio.some(c => c.tenantId === activeClientId);
      if (!stillEngaged) {
        setActiveClient(res.portfolio.length === 1 ? res.portfolio[0].tenantId : null);
      }
    } catch {
      // Silent — pages that need the portfolio surface their own error.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgency]);

  // Hydrate portfolio when the user becomes an agency user.
  useEffect(() => {
    if (!isAgency) {
      setPortfolio([]);
      setActiveClient(null);
      return;
    }
    void refresh();
  }, [isAgency, refresh, setActiveClient]);

  const activeClient = useMemo(
    () => portfolio.find(c => c.tenantId === activeClientId) ?? null,
    [portfolio, activeClientId],
  );

  const value: AgencyClientContextType = {
    portfolio,
    activeClientId,
    activeClient,
    setActiveClient,
    loading,
    refresh,
  };
  return <AgencyClientContext.Provider value={value}>{children}</AgencyClientContext.Provider>;
}

export function useAgencyClient(): AgencyClientContextType {
  return useContext(AgencyClientContext);
}
