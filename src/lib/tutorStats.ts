// Per-tutor rollups for the admin views. Results are attributed to a tutor via
// their exam's tutorId (examId -> exam.tutorId), NOT via a tutorId field on the
// result — client-mode submissions don't carry one, so joining through the exam
// is the only correct attribution.

import type { Exam, Result, Tutor } from "../hooks/types";
import { averagePercentage, passRate } from "./analytics";

export interface TutorRollup {
  uid: string;
  name: string;
  email: string;
  active: boolean;
  assignedClasses: string[];
  examsCreated: number;
  submissions: number;
  averagePercentage: number;
  passRate: number;
}

export function buildExamTutorMap(exams: ReadonlyArray<Exam>): Map<string, string> {
  const map = new Map<string, string>();
  for (const exam of exams) {
    if (exam.tutorId) map.set(exam.id, exam.tutorId);
  }
  return map;
}

export function resultsForTutor(
  uid: string,
  exams: ReadonlyArray<Exam>,
  results: ReadonlyArray<Result>,
): Result[] {
  const map = buildExamTutorMap(exams);
  return results.filter((r) => map.get(r.examId ?? "") === uid);
}

export function rollupByTutor(
  exams: ReadonlyArray<Exam>,
  results: ReadonlyArray<Result>,
  tutors: ReadonlyArray<Tutor>,
): TutorRollup[] {
  const examToTutor = buildExamTutorMap(exams);

  const byTutor = new Map<string, Result[]>();
  for (const result of results) {
    const tid = examToTutor.get(result.examId ?? "");
    if (!tid) continue;
    const list = byTutor.get(tid) ?? [];
    list.push(result);
    byTutor.set(tid, list);
  }

  const examCount = new Map<string, number>();
  for (const exam of exams) {
    if (exam.tutorId) examCount.set(exam.tutorId, (examCount.get(exam.tutorId) ?? 0) + 1);
  }

  return tutors
    .map((tutor) => {
      const uid = tutor.uid || tutor.id;
      const rs = byTutor.get(uid) ?? [];
      return {
        uid,
        name: tutor.name || tutor.email || uid,
        email: tutor.email || "",
        active: tutor.active !== false,
        assignedClasses: tutor.assignedClasses ?? [],
        examsCreated: examCount.get(uid) ?? 0,
        submissions: rs.length,
        averagePercentage: averagePercentage(rs),
        passRate: passRate(rs),
      };
    })
    .sort((a, b) => b.passRate - a.passRate);
}
