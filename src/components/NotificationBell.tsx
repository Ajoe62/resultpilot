import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { timeAgo, toMillis } from "../hooks/util";
import type { AppNotification } from "../types/theory";

// Bell + unread badge + dropdown of the last 10 notifications. Clicking one
// marks it read and deep-links to the relevant submission in the marking queue.
export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleClick = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) markRead(n.id);
    navigate(n.submissionId ? `/tutor/marking?submission=${n.submissionId}` : "/tutor/marking");
  };

  return (
    <div className="notif">
      <button className="notif__bell" type="button" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <span aria-hidden>🔔</span>
        {unreadCount > 0 ? <span className="notif__badge">{unreadCount}</span> : null}
      </button>

      {open ? (
        <>
          <div className="notif__scrim" onClick={() => setOpen(false)} />
          <div className="notif__dropdown card">
            <div className="notif__head">
              <strong>Notifications</strong>
              {unreadCount > 0 ? (
                <button className="secondary-button" type="button" onClick={markAllRead}>Mark all read</button>
              ) : null}
            </div>
            <div className="stack-list">
              {notifications.map((n) => (
                <button
                  className={`notif__item ${n.read ? "" : "notif__item--unread"}`}
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                >
                  <strong>{n.title}</strong>
                  <p className="muted-text">{n.body}</p>
                  <small>{timeAgo(toMillis(n.createdAt) || n.createdAtMs || 0)}</small>
                </button>
              ))}
              {notifications.length === 0 ? <p className="muted-text">No notifications.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
