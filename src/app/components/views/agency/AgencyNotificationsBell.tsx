import { useEffect, useState } from 'react';
import { Bell, Briefcase, CheckCheck, FileText, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import * as notifApi from '../../../api/agencyNotifications';
import type { AgencyNotificationDto } from '../../../api/agencyNotifications';

/**
 * Top-bar notification bell for the agency workspace. Parallel to
 * the tenant-side {@code NotificationsBell} but hits the agency
 * endpoints (V228 sibling table) — different identity pool, so
 * neither can pull from the other's inbox.
 *
 * <p>Polling every 60s while the tab is visible; a fresh list is
 * fetched when the popover opens. Same soft-fail pattern as the
 * tenant bell: any network hiccup is swallowed so a transient
 * error doesn't red-toast on every 60s tick.</p>
 */
export function AgencyNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AgencyNotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshCount = async () => {
    try {
      const { count } = await notifApi.notifications.unreadCount();
      setUnread(count);
    } catch { /* soft-fail */ }
  };

  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => {
      if (!document.hidden) void refreshCount();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadList = async () => {
    setLoading(true);
    try { setItems(await notifApi.notifications.list()); }
    catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) void loadList();
    else      void refreshCount();
  }, [open]);

  const onItemClick = async (n: AgencyNotificationDto) => {
    if (n.read) return;
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    setUnread(c => Math.max(0, c - 1));
    try { await notifApi.notifications.markRead(n.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not mark as read'); }
  };

  const onMarkAll = async () => {
    if (unread === 0) return;
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setUnread(0);
    try { await notifApi.notifications.markAllRead(); }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark all as read');
      void loadList();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9"
          title="Notifications" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center
                             h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold
                             bg-red-600 text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-blue-600" /> Notifications
            {unread > 0 && (
              <span className="text-[11px] text-gray-500">({unread} unread)</span>
            )}
          </div>
          {unread > 0 && (
            <button type="button" onClick={() => void onMarkAll()}
              className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading && (
            <div className="p-6 text-center text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-500">
              <Bell className="h-5 w-5 text-gray-300 mx-auto mb-1.5" />
              You're all caught up — no notifications.
            </div>
          )}
          {!loading && items.map(n => (
            <button key={n.id} type="button" onClick={() => void onItemClick(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-2.5
                          hover:bg-gray-50 transition-colors ${n.read ? '' : 'bg-blue-50/30'}`}>
              <TypeIcon type={n.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {n.title}
                  </span>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />}
                </div>
                {n.body && (
                  <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</div>
                )}
                <div className="text-[10px] text-gray-400 mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                  {n.entityType && n.entityId && (
                    <span className="ml-2">
                      {n.entityType} · {n.entityId.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 mt-0.5 shrink-0 text-blue-600';
  if (type.startsWith('case'))        return <Briefcase className={cls} />;
  if (type.startsWith('deliverable')) return <FileText className={cls} />;
  if (type.startsWith('task'))        return <MailCheck className={cls} />;
  return <Bell className={cls} />;
}
