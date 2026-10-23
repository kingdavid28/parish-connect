import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { API } from "../config";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface AppNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  read_at: string | null;
  created_at: string;
}

interface NotificationData {
  items: AppNotification[];
  unread_count: number;
}

const getToken = () =>
  localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

function relativeTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDistanceToNow(date, { addSuffix: true });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationData>({ items: [], unread_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`${API}/notifications?limit=25`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load notifications");
      }
      setData(result.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notifications");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchNotifications();
    }, 30_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void fetchNotifications();
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [fetchNotifications]);

  const markRead = async (notification: AppNotification) => {
    if (notification.read_at) {
      navigate(notification.url || "/");
      return;
    }
    setBusyId(notification.id);
    try {
      const response = await fetch(`${API}/notifications/${notification.id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update notification");
      }
      setData((current) => ({
        ...current,
        unread_count: Math.max(0, current.unread_count - 1),
        items: current.items.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        ),
      }));
      navigate(notification.url || "/");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update notification");
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (!data.unread_count) return;
    setBusyId("all");
    try {
      const response = await fetch(`${API}/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update notifications");
      }
      const readAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        unread_count: 0,
        items: current.items.map((item) => ({ ...item, read_at: item.read_at || readAt })),
      }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update notifications");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Popover onOpenChange={(open) => { if (open) void fetchNotifications(true); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={data.unread_count
            ? `Notifications, ${data.unread_count} unread`
            : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {data.unread_count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
              {data.unread_count > 99 ? "99+" : data.unread_count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {data.unread_count ? `${data.unread_count} unread` : "You're all caught up"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={!data.unread_count || busyId === "all"}
            onClick={() => { void markAllRead(); }}
          >
            {busyId === "all"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><CheckCheck className="mr-1 h-4 w-4" />Mark all read</>}
          </Button>
        </div>
        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
            </div>
          ) : error ? (
            <div className="space-y-3 p-4 text-sm text-red-600">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { void fetchNotifications(true); }}>
                Try again
              </Button>
            </div>
          ) : data.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul>
              {data.items.map((notification) => (
                <li key={notification.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                      notification.read_at ? "" : "bg-blue-50/70"
                    }`}
                    disabled={busyId === notification.id}
                    onClick={() => { void markRead(notification); }}
                  >
                    <span className="flex items-start gap-2">
                      {!notification.read_at && (
                        <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{notification.title}</span>
                        {notification.body && (
                          <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {notification.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {relativeTime(notification.created_at)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
