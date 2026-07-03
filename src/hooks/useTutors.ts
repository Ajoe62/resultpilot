import { collection, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { toMillis } from "./util";
import type { Tutor } from "./types";

// Tutors for the admin's school. Admin-only: a tutor caller resolves to an empty
// list (and the rules would deny the read anyway).
export function useTutors() {
  const { role, schoolId } = useAuth();

  const { data, loading, error } = useLiveDocs<Tutor>(() => {
    if (role !== "schooladmin" || !schoolId) return null;
    return query(collection(db, "schools", schoolId, "tutors"));
  }, [role, schoolId]);

  const tutors = [...data].sort((a, b) => toMillis(b.acceptedAt) - toMillis(a.acceptedAt));

  return { tutors, loading, error };
}
