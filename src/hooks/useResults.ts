import { collection, query, where } from "firebase/firestore";
import type { QueryConstraint } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import type { Result } from "./types";

// Results scoped by role, optionally narrowed to one exam. All filters are
// equality (schoolId / tutorId / examId) so single-field indexes suffice.
export function useResults(examId?: string) {
  const { role, schoolId, currentUser } = useAuth();
  const uid: string | null = currentUser?.uid ?? null;

  const { data, loading, error } = useLiveDocs<Result>(() => {
    if (!schoolId || !role) return null;
    const constraints: QueryConstraint[] = [where("schoolId", "==", schoolId)];
    if (role === "tutor") {
      if (!uid) return null;
      constraints.push(where("tutorId", "==", uid));
    }
    if (examId) constraints.push(where("examId", "==", examId));
    return query(collection(db, "results"), ...constraints);
  }, [role, schoolId, uid, examId]);

  const results = [...data].sort((a, b) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0));

  return { results, loading, error };
}
