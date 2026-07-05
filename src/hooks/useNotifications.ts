import { collection, doc, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { toMillis } from "./util";
import type { AppNotification } from "../types/theory";

function sortKey(n: AppNotification): number {
  return toMillis(n.createdAt) || n.createdAtMs || 0;
}

// Real-time notifications for the signed-in user (the recipient). Scoped by
// recipientId only (equality → no composite index); sorted client-side.
export function useNotifications() {
  const { currentUser } = useAuth();
  const uid: string | null = currentUser?.uid ?? null;

  const { data, loading, error } = useLiveDocs<AppNotification>(() => {
    if (!uid) return null;
    return query(collection(db, "notifications"), where("recipientId", "==", uid));
  }, [uid]);

  const notifications = [...data].sort((a, b) => sortKey(b) - sortKey(a)).slice(0, 10);
  const unreadCount = data.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    const unread = data.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
      await batch.commit();
    } catch {
      /* ignore */
    }
  };

  return { notifications, unreadCount, loading, error, markRead, markAllRead };
}
