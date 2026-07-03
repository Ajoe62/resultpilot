import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { QueryConstraint } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./useAuth";
import type { Result } from "./types";

export interface ClassTrendPoint {
  examId: string;
  examTitle: string;
  average: number;
  count: number;
}

export interface AnalyticsData {
  totalExams: number;
  totalStudents: number;
  averagePassRate: number;
  recentResults: Result[];
  classPerformanceTrend: ClassTrendPoint[];
  loading: boolean;
  error: Error | null;
}

const EMPTY: AnalyticsData = {
  totalExams: 0,
  totalStudents: 0,
  averagePassRate: 0,
  recentResults: [],
  classPerformanceTrend: [],
  loading: true,
  error: null,
};

// Aggregated analytics over the caller's scoped results. Uses getDocs (a single
// read burst) rather than a live listener — analytics don't need realtime and it
// keeps read costs predictable on the free plan.
export function useAnalytics(): AnalyticsData {
  const { role, schoolId, currentUser } = useAuth();
  const uid: string | null = currentUser?.uid ?? null;
  const [state, setState] = useState<AnalyticsData>(EMPTY);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!schoolId || !role || (role === "tutor" && !uid)) {
        if (active) setState({ ...EMPTY, loading: false });
        return;
      }

      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const constraints: QueryConstraint[] = [where("schoolId", "==", schoolId)];
        if (role === "tutor") constraints.push(where("tutorId", "==", uid));
        const snapshot = await getDocs(query(collection(db, "results"), ...constraints));
        const results = snapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) }) as Result,
        );

        if (!active) return;
        setState({ ...aggregate(results), loading: false, error: null });
      } catch (error) {
        console.error("useAnalytics failed", error);
        if (active) setState({ ...EMPTY, loading: false, error: error as Error });
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [role, schoolId, uid]);

  return state;
}

function aggregate(results: Result[]) {
  const students = new Set<string>();
  const perExam = new Map<string, { title: string; sum: number; count: number; latest: number }>();
  let passed = 0;

  for (const result of results) {
    students.add(result.studentId || result.studentName || result.id);
    if (result.passed) passed += 1;

    const examId = result.examId || "unknown";
    const bucket = perExam.get(examId) || {
      title: result.examTitle || examId,
      sum: 0,
      count: 0,
      latest: 0,
    };
    bucket.sum += result.percentage ?? 0;
    bucket.count += 1;
    bucket.latest = Math.max(bucket.latest, result.submittedAtMs ?? 0);
    perExam.set(examId, bucket);
  }

  const classPerformanceTrend: ClassTrendPoint[] = [...perExam.entries()]
    .map(([examId, bucket]) => ({
      examId,
      examTitle: bucket.title,
      average: bucket.count ? Math.round(bucket.sum / bucket.count) : 0,
      count: bucket.count,
    }))
    .sort((a, b) => (perExam.get(a.examId)!.latest - perExam.get(b.examId)!.latest))
    .slice(-10);

  const recentResults = [...results]
    .sort((a, b) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0))
    .slice(0, 10);

  return {
    totalExams: perExam.size,
    totalStudents: students.size,
    averagePassRate: results.length ? Math.round((passed / results.length) * 100) : 0,
    recentResults,
    classPerformanceTrend,
  };
}
