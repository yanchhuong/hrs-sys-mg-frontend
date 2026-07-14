import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '../../ui/card';
import { Button } from '../../ui/button';
import { Bell, Briefcase, CheckCheck, FileText, Loader2, MailCheck, RefreshCw } from 'lucide-react';
import * as notifApi from '../../../api/agencyNotifications';
import type { AgencyNotificationDto } from '../../../api/agencyNotifications';

/**
 * v-agency-fe-7 — dedicated inbox for agency notifications
 * (V228). Mirrors the tenant bell dropdown's data model but as
 * a full-page surface — agencies get pinged more often than
 * tenants (assignments, rejections, client replies) so a
 * dedicated page is easier to scan than a dropdown.
 */
export function AgencyNotificationsPage() {
  const [rows, setRows] = useState<AgencyNotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await notifApi.notifications.list();
      setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unread = useMemo(() => rows.filter(r => !r.read).length, [rows]);

  const markRead = async (id: string) => {
    try {
      await notifApi.notifications.markRead(id);
      // Optimistic — flip locally so the row shifts to "read"
      // without a full reload.
      setRows(rs => rs.map(r => r.id === id ? { ...r, read: true } : r));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const markAllRead = async () => {
    if (unread === 0) return;
    setBusy(true);
    try {
      await notifApi.notifications.markAllRead();
      setRows(rs => rs.map(r => ({ ...r, read: true })));
      toast.success(`Marked ${unread} notification${unread === 1 ? '' : 's'} as read`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            Notifications
            {unread > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-rose-500 text-white text-[10px] font-semibold px-1.5">
                {unread}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Client replies, rejected deliverables, task assignments. Click a row to
            mark it read.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={markAllRead} disabled={busy || unread === 0}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1.5" />}
            Mark all read
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="text-sm text-gray-500">
            {rows.length} in your inbox
          </div>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nothing here yet. Notifications land when a client replies on a case,
              a reviewer rejects a deliverable, or someone assigns you a task.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left py-3 px-2 flex items-start gap-3 transition ${
                      n.read ? 'opacity-70 hover:bg-gray-50' : 'bg-blue-50/30 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <TypeIcon type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-900'} truncate`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      </div>
                      {n.body && (
                        <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</div>
                      )}
                      <div className="text-[11px] text-gray-500 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                        {n.entityType && n.entityId && (
                          <span className="ml-2 text-gray-400">
                            {n.entityType} · {n.entityId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 text-blue-600';
  if (type.startsWith('case'))         return <Briefcase className={cls} />;
  if (type.startsWith('deliverable'))  return <FileText className={cls} />;
  if (type.startsWith('task'))         return <MailCheck className={cls} />;
  return <Bell className={cls} />;
}
