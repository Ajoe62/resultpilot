// Shared model types for the scoped data hooks. Firestore documents are only
// loosely validated at write time, so most fields are optional here — the hooks
// return whatever is stored, plus a guaranteed `id`.

export type Role = "schooladmin" | "tutor";

export interface WithId {
  id: string;
}

export interface Exam extends WithId {
  title?: string;
  subject?: string;
  academicSession?: string;
  term?: string;
  duration?: number;
  passmark?: number;
  pin?: string;
  assessmentType?: string;
  assessmentMaxScore?: number;
  isActive?: boolean;
  isArchived?: boolean;
  schoolId?: string;
  tutorId?: string;
  classId?: string;
  createdAt?: unknown;
}

export interface Result extends WithId {
  studentName?: string;
  studentId?: string;
  admissionNumber?: string;
  class?: string;
  classId?: string;
  school?: string;
  schoolId?: string;
  subject?: string;
  academicSession?: string;
  term?: string;
  examId?: string;
  examTitle?: string;
  tutorId?: string;
  assessmentType?: string;
  assessmentMaxScore?: number;
  score?: number;
  total?: number;
  percentage?: number;
  timeTaken?: number;
  passed?: boolean;
  submittedAtMs?: number;
  answers?: Array<{ questionId: string; selected: string | null; correct: string }>;
}

export interface Student extends WithId {
  fullName?: string;
  admissionNumber?: string;
  classId?: string;
  className?: string;
  schoolId?: string;
  isActive?: boolean;
}

export interface ClassRoom extends WithId {
  name?: string;
  schoolId?: string;
  isActive?: boolean;
}

export interface Tutor extends WithId {
  uid?: string;
  name?: string;
  email?: string;
  assignedClasses?: string[];
  schoolId?: string;
  active?: boolean;
  inviteAccepted?: boolean;
  lastActiveAt?: unknown;
  acceptedAt?: unknown;
}

export interface QueryState<T> {
  loading: boolean;
  error: Error | null;
  data: T;
}

// Firestore caps `in` / `array-contains-any` at 30 values. Bound assigned-class
// lists so a tutor with many classes doesn't throw at query time.
export const IN_QUERY_LIMIT = 30;

export function boundedIn<T>(values: T[]): T[] {
  return Array.isArray(values) ? values.slice(0, IN_QUERY_LIMIT) : [];
}
