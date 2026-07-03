import { collection, documentId, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { boundedIn } from "./types";
import type { ClassRoom } from "./types";

// Classes scoped by role: all school classes for an admin, only assigned classes
// for a tutor. Class ids are globally unique, so the tutor query filters by
// documentId() alone (no composite index, no cross-school leakage — the rules
// still enforce the tutor's school).
export function useClasses() {
  const { role, schoolId, assignedClasses } = useAuth();
  const classesKey = (assignedClasses ?? []).join(",");

  const { data, loading, error } = useLiveDocs<ClassRoom>(() => {
    if (!schoolId || !role) return null;
    const base = collection(db, "classes");

    if (role === "tutor") {
      const classes = boundedIn((assignedClasses ?? []) as string[]);
      if (classes.length === 0) return null;
      return query(base, where(documentId(), "in", classes));
    }
    return query(base, where("schoolId", "==", schoolId));
  }, [role, schoolId, classesKey]);

  const classes = [...data].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  return { classes, loading, error };
}
