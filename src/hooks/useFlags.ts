import { collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { toMillis } from "./util";
import type { WithId } from "./types";

export interface Flag extends WithId {
  schoolId?: string;
  raisedBy?: string;
  studentId?: string;
  studentName?: string;
  note?: string;
  resolved?: boolean;
  createdAt?: unknown;
}

// Student flags raised by tutors, for admin review. Admin-only (rules deny
// tutors from listing the whole collection).
export function useFlags() {
  const { role, schoolId } = useAuth();

  const { data, loading, error } = useLiveDocs<Flag>(() => {
    if (role !== "schooladmin" || !schoolId) return null;
    return query(collection(db, "flags"), where("schoolId", "==", schoolId));
  }, [role, schoolId]);

  const flags = [...data].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  return { flags, loading, error };
}
