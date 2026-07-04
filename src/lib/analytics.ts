// Pure client-side aggregations over scoped Result[] — no Firestore, no React.
// Kept dependency-free so it's unit-testable and reusable across tutor views.

import type { Result } from "../hooks/types";

export type Trend = "up" | "down" | "neutral";

export interface ExamSummary {
  examId: string;
  examTitle: string;
  count: number;
  average: number; // mean percentage
  passCount: number;
  failCount: number;
  latestMs: number;
}

export interface SubjectSummary {
  subject: string;
  average: number;
  count: number;
}

export interface StudentSummary {
  key: string;
  studentName: string;
  studentId: string;
  classId: string;
  count: number;
  average: number;
  lastMs: number;
  trend: Trend;
  consecutiveFails: number; // trailing run of failures (most recent first)
}

function keyOf(r: Result): string {
  return r.studentId || r.studentName || r.id;
}

export function averagePercentage(results: ReadonlyArray<Result>): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + (r.percentage ?? 0), 0);
  return Math.round(sum / results.length);
}

export function passRate(results: ReadonlyArray<Result>): number {
  if (results.length === 0) return 0;
  const passed = results.filter((r) => r.passed).length;
  return Math.round((passed / results.length) * 100);
}

export function distinctStudents(results: ReadonlyArray<Result>): number {
  return new Set(results.map(keyOf)).size;
}

export function summariseByExam(results: ReadonlyArray<Result>): ExamSummary[] {
  const map = new Map<string, ExamSummary>();
  for (const r of results) {
    const examId = r.examId || "unknown";
    const s = map.get(examId) ?? {
      examId,
      examTitle: r.examTitle || examId,
      count: 0,
      average: 0,
      passCount: 0,
      failCount: 0,
      latestMs: 0,
    };
    s.count += 1;
    s.average += r.percentage ?? 0; // running sum; divided below
    if (r.passed) s.passCount += 1;
    else s.failCount += 1;
    s.latestMs = Math.max(s.latestMs, r.submittedAtMs ?? 0);
    map.set(examId, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, average: s.count ? Math.round(s.average / s.count) : 0 }))
    .sort((a, b) => a.latestMs - b.latestMs);
}

export function summariseBySubject(results: ReadonlyArray<Result>): SubjectSummary[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of results) {
    const subject = r.subject || "Unknown";
    const bucket = map.get(subject) ?? { sum: 0, count: 0 };
    bucket.sum += r.percentage ?? 0;
    bucket.count += 1;
    map.set(subject, bucket);
  }
  return [...map.entries()]
    .map(([subject, b]) => ({ subject, average: Math.round(b.sum / b.count), count: b.count }))
    .sort((a, b) => b.average - a.average);
}

export function summariseByStudent(results: ReadonlyArray<Result>): StudentSummary[] {
  const map = new Map<string, Result[]>();
  for (const r of results) {
    const k = keyOf(r);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }

  const summaries: StudentSummary[] = [];
  for (const [key, list] of map.entries()) {
    const ordered = [...list].sort((a, b) => (a.submittedAtMs ?? 0) - (b.submittedAtMs ?? 0));
    const percentages = ordered.map((r) => r.percentage ?? 0);
    const average = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);

    // Trend from the last three attempts.
    let trend: Trend = "neutral";
    if (percentages.length >= 2) {
      const recent = percentages.slice(-3);
      const delta = recent[recent.length - 1] - recent[0];
      trend = delta > 2 ? "up" : delta < -2 ? "down" : "neutral";
    }

    // Trailing run of consecutive failures (most recent backwards).
    let consecutiveFails = 0;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (ordered[i].passed === false) consecutiveFails += 1;
      else break;
    }

    const last = ordered[ordered.length - 1];
    summaries.push({
      key,
      studentName: last.studentName || key,
      studentId: last.studentId || "",
      classId: last.classId || "",
      count: ordered.length,
      average,
      lastMs: last.submittedAtMs ?? 0,
      trend,
      consecutiveFails,
    });
  }
  return summaries;
}

export function topStudents(results: ReadonlyArray<Result>, n = 5): StudentSummary[] {
  return [...summariseByStudent(results)].sort((a, b) => b.average - a.average).slice(0, n);
}

export function bottomStudents(results: ReadonlyArray<Result>, n = 5): StudentSummary[] {
  return [...summariseByStudent(results)].sort((a, b) => a.average - b.average).slice(0, n);
}

// Students with 2+ consecutive failing attempts (most recent runs).
export function atRiskStudents(results: ReadonlyArray<Result>): StudentSummary[] {
  return summariseByStudent(results)
    .filter((s) => s.consecutiveFails >= 2)
    .sort((a, b) => b.consecutiveFails - a.consecutiveFails);
}

// Per-question wrong-rate for one exam's results — drives the breakdown table.
export interface QuestionStat {
  questionId: string;
  answered: number;
  correct: number;
  wrongRate: number; // 0..100
}

export function questionBreakdown(results: ReadonlyArray<Result>): QuestionStat[] {
  const map = new Map<string, { answered: number; correct: number }>();
  for (const r of results) {
    for (const a of r.answers ?? []) {
      const stat = map.get(a.questionId) ?? { answered: 0, correct: 0 };
      stat.answered += 1;
      if (a.selected != null && a.selected === a.correct) stat.correct += 1;
      map.set(a.questionId, stat);
    }
  }
  return [...map.entries()]
    .map(([questionId, s]) => ({
      questionId,
      answered: s.answered,
      correct: s.correct,
      wrongRate: s.answered ? Math.round(((s.answered - s.correct) / s.answered) * 100) : 0,
    }))
    .sort((a, b) => b.wrongRate - a.wrongRate);
}
