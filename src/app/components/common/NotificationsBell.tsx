import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2, Megaphone, PartyPopper, Newspaper, CalendarHeart, Inbox } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../ui/popover';
import * as api from '../../api/notifications';

/**
 * Top-bar notification bell — sits between the AppLauncher and
 * LanguageSwitcher. Drops down a list of recent announcements the
 * user is in the audience for; unread items get a coloured dot +
 * inflate the badge count on the bell.
 *
 * <p>Polling is light-touch: fetch the unread count on mount + every
 * 60s, and a fresh list when the popover opens. No web-socket — the
 * announcement velocity in a typical tenant doesn't justify it.</p>
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<api.Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshCount = async () => {
    try { setUnread(await api.unreadCount()); } catch { /* soft-fail */ }
  };

  useEffect(() => {
    void refreshCount();
    // 60s polling — good enough for a notification surface and
    // avoids the extra moving part of a websocket subscription.
    const id = window.setInterval(() => { void refreshCount(); }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadList = async () => {
    setLoading(true);
    try { setItems(await api.list()); } catch { setItems([]); }
    finally { setLoading(false); }
  };

  // Fetch the dropdown content on open; counts can re-sync on close.
  useEffect(() => {
    if (open) void loadList();
    else      void refreshCount();
  }, [open]);

  const onItemClick = async (n: api.Notification) => {
    if (!n.read) {
      // Optimistic local update so the dropdown reads as "read"
      // immediately even before the network round-trip lands.
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(c => Math.max(0, c - 1));
      try { await api.markRead(n.id); } catch (e) {
        // Rare — if it fails, the next refresh will reconcile.
        toast.error(e instanceof Error ? e.message : 'Could not mark as read');
      }
    }
  };

  const onMarkAll = async () => {
    if (unread === 0) return;
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setUnread(0);
    try { await api.markAllRead(); } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark all as read');
      void loadList(); // resync on failure
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
              <Megaphone className="h-5 w-5 text-gray-300 mx-auto mb-1.5" />
              You're all caught up — no notifications.
            </div>
          )}
          {!loading && items.map(n => (
            <button key={n.id} type="button" onClick={() => void onItemClick(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-2.5
                          hover:bg-gray-50 transition-colors ${n.read ? '' : 'bg-blue-50/30'}`}>
              {/* Type-coloured leading icon — same palette as the
                  Type badge on the Announcements list. */}
              <TypeIcon type={n.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm ${n.read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {n.title}
                  </span>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-500 truncate mt-0.5">{n.body}</div>
                {n.publishAt && (
                  <div className="text-[10px] text-gray-400 mt-1">
                    {new Date(n.publishAt).toLocaleString()}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TypeIcon({ type }: { type: api.NotificationType }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  switch (type) {
    case 'HOLIDAY': return <PartyPopper className={`${cls} text-rose-600`} />;
    case 'NEWS':    return <Newspaper className={`${cls} text-blue-600`} />;
    case 'EVENTS':  return <CalendarHeart className={`${cls} text-purple-600`} />;
    case 'OTHERS':
    default:        return <Inbox className={`${cls} text-gray-500`} />;
  }
}
