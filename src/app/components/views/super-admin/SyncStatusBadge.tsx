import { useEffect, useState } from 'react';
import { Badge } from '../../ui/badge';
import { CheckCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import { USE_MOCKS } from '../../../api/client';
import * as platformApi from '../../../api/platform';

/**
 * Inline badge that shows whether a tenant's local install is "100% in
 * sync" with the cloud. Reads {@link platformApi.syncState.byTenant} on
 * mount; refetches when the tenantId prop changes.
 *
 *   in-sync    — green tick + "100% in sync"
 *   drift      — amber warn + "Drift: N rows"
 *   no data    — gray dash + "No heartbeat yet" (the local install hasn't
 *                ever called /local/sync/heartbeat)
 *
 * Cheap enough to mount one per Companies-table row (single GET each).
 */
export function SyncStatusBadge({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<platformApi.TenantSyncState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (USE_MOCKS) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await platformApi.syncState.byTenant(tenantId);
        if (!cancelled) setState(s);
      } catch {
        // 404 / no row — leave state null. Renders as "No heartbeat yet".
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  if (!loaded) {
    return <span className="text-xs text-gray-400">…</span>;
  }
  if (!state || !state.lastSyncedAt) {
    return (
      <Badge variant="outline" className="text-gray-500 gap-1" title="Local install hasn't sent a heartbeat yet">
        <MinusCircle className="h-3 w-3" />
        No heartbeat
      </Badge>
    );
  }
  if (state.inSync) {
    return (
      <Badge className="bg-green-100 text-green-800 gap-1" title={`Last heartbeat: ${new Date(state.lastSyncedAt).toLocaleString()}`}>
        <CheckCircle className="h-3 w-3" />
        100% in sync
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 gap-1" title={`Last heartbeat: ${new Date(state.lastSyncedAt).toLocaleString()}`}>
      <AlertTriangle className="h-3 w-3" />
      Drift: {state.totalDrift}
    </Badge>
  );
}
