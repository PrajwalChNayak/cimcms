import { useDispatch, useSelector } from "react-redux";
import {
  selectNotifications,
  selectUnreadCount,
  selectNotificationsPanelOpen,
  markAsRead,
  markAllAsRead,
  toggleNotificationsPanel,
  closeNotificationsPanel,
} from "@store/slices/notificationsSlice";
import type { Notification } from "@api/mockData";

const severityStyle: Record<Notification["severity"], { dot: string; text: string }> = {
  critical: { dot: "bg-rose-400", text: "text-rose-400" },
  warning: { dot: "bg-amber-400", text: "text-amber-400" },
  info: { dot: "bg-sky-400", text: "text-sky-400" },
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const NotificationBell = () => {
  const dispatch = useDispatch();
  const notifications = useSelector(selectNotifications);
  const unread = useSelector(selectUnreadCount);
  const isOpen = useSelector(selectNotificationsPanelOpen);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => dispatch(toggleNotificationsPanel())}
        className="relative w-9 h-9 rounded-btn flex items-center justify-center hover:bg-primary/8 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => dispatch(closeNotificationsPanel())}
          />
          <div className="absolute right-0 top-11 z-40 w-80 rounded-card border border-border bg-surface shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => dispatch(markAllAsRead())}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-secondary">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => {
                  const s = severityStyle[n.severity];
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => dispatch(markAsRead(n.id))}
                      className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-background transition-colors border-b border-border last:border-0 ${
                        !n.read ? "bg-primary/4" : ""
                      } cursor-pointer`}
                    >
                      <div className="mt-1 shrink-0">
                        <span className={`block w-2 h-2 rounded-full ${s.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${s.text}`}>{n.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                          {n.message}
                        </p>
                        <p className="text-xs text-text-secondary mt-1">{timeAgo(n.timestamp)}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
