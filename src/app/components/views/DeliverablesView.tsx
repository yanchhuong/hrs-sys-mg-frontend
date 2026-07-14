import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import * as delivsApi from '../../api/agencyDeliverables';
import type { DeliverableDto } from '../../api/agencyDeliverables';
import { DeliverableDetailDialog } from './agency/DeliverableDetailDialog';

/**
 * v-agency-fe-3 — tenant document vault. Only shows delivered
 * artefacts (BE filters status='delivered'); drafts and in-review
 * rows are the agency's WIP. Clicking a row opens the shared
 * detail dialog with side='tenant' → read-only view + download link.
 */
export function DeliverablesView() {
  const [rows, setRows] = useState<DeliverableDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await delivsApi.tenant.list();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Agency deliverables
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Signed-off artefacts your agency has delivered — management accounts,
            tax packages, statutory financials. Retained per Cambodian 10-year rule.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm text-gray-500">
            {rows.length} deliverable{rows.length === 1 ? '' : 's'} on file
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nothing delivered yet. Your agency will land artefacts here after
              partner sign-off.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => (
                <li key={r.id} className="py-3 px-1 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDetailId(r.id)}
                        className="text-sm font-medium text-gray-900 hover:underline text-left truncate"
                      >
                        {r.title}
                      </button>
                      <Badge className="border-teal-200 bg-teal-100 text-teal-700 border text-[10px] px-1.5 py-0">
                        {r.kind.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-gray-500 tabular-nums">{r.period}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Delivered
                      {r.deliveredAt && ` ${new Date(r.deliveredAt).toLocaleString()}`}
                      {r.approverName && ` · approved by ${r.approverName}`}
                    </div>
                  </div>
                  {r.deliveredAttachmentUrl && (
                    <a
                      href={r.deliveredAttachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {r.deliveredFilename ?? 'Download'}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DeliverableDetailDialog
        open={!!detailId}
        onOpenChange={o => { if (!o) setDetailId(null); }}
        deliverableId={detailId}
        side="tenant"
      />
    </div>
  );
}
