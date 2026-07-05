import { collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import type { TheorySubmission } from "../types/theory";

// Theory submissions scoped by role: the owning tutor sees their own; a school
// admin sees all. Priority (any low-confidence answer) sorts first, then newest.
export function useTheorySubmissions() {
  const { role, schoolId, currentUser } = useAuth();
  const uid: string | null = currentUser?.uid ?? null;

  const { data, loading, error } = useLiveDocs<TheorySubmission>(() => {
    if (!schoolId || !role) return null;
    const base = collection(db, "theorySubmissions");
    if (role === "tutor") {
      if (!uid) return null;
      return query(base, where("schoolId", "==", schoolId), where("tutorId", "==", uid));
    }
    return query(base, where("schoolId", "==", schoolId));
  }, [role, schoolId, uid]);

  const submissions = [...data].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0);
  });

  const pending = submissions.filter((s) => s.status !== "finalised");

  return { submissions, pending, loading, error };
}
