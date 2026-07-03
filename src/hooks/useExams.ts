import { collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { toMillis } from "./util";
import type { Exam } from "./types";

// Exams scoped to the caller's role: all school exams for an admin, only the
// tutor's own exams for a tutor. Scoping is enforced in the query (never
// client-side). Sorting is client-side to avoid composite indexes.
export function useExams() {
  const { role, schoolId, currentUser } = useAuth();
  const uid: string | null = currentUser?.uid ?? null;

  const { data, loading, error } = useLiveDocs<Exam>(() => {
    if (!schoolId || !role) return null;
    const base = collection(db, "exams");
    if (role === "tutor") {
      if (!uid) return null;
      return query(base, where("schoolId", "==", schoolId), where("tutorId", "==", uid));
    }
    return query(base, where("schoolId", "==", schoolId));
  }, [role, schoolId, uid]);

  const exams = [...data]
    .filter((exam) => !exam.isArchived)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  return { exams, loading, error };
}
