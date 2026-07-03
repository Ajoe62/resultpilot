import { collection, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import { useLiveDocs } from "./useLiveDocs";
import { boundedIn } from "./types";
import type { Student } from "./types";

// Students scoped by role: all school students for an admin (optionally one
// class), only assigned-class students for a tutor. The tutor path filters by
// classId in-query (needs the students(schoolId, classId) composite index).
export function useStudents(classId?: string) {
  const { role, schoolId, assignedClasses } = useAuth();
  const classesKey = (assignedClasses ?? []).join(",");

  const { data, loading, error } = useLiveDocs<Student>(() => {
    if (!schoolId || !role) return null;
    const base = collection(db, "students");

    if (role === "tutor") {
      const classes = boundedIn((assignedClasses ?? []) as string[]);
      if (classId) {
        if (!classes.includes(classId)) return null; // not the tutor's class
        return query(base, where("schoolId", "==", schoolId), where("classId", "==", classId));
      }
      if (classes.length === 0) return null;
      return query(base, where("schoolId", "==", schoolId), where("classId", "in", classes));
    }

    if (classId) {
      return query(base, where("schoolId", "==", schoolId), where("classId", "==", classId));
    }
    return query(base, where("schoolId", "==", schoolId));
  }, [role, schoolId, classesKey, classId]);

  return { students: data, loading, error };
}
