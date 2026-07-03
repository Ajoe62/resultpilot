// Theory / essay assessment types. Complements the existing MCQ models in
// ../hooks/types (Exam, Result). Storage is FLAT + discriminator fields
// (schoolId, tutorId) to match results/exams. AI marking is provider-agnostic
// (the platform uses Gemini today); the AIMarkingResult carries the model id so
// the source is auditable. Strict throughout — no `any`; Firestore Timestamps
// are typed `unknown` (normalize with hooks/util.toMillis).

import type { Exam, Result, WithId } from "../hooks/types";

// ============================================================================
// Questions — the exams/{examId}/questions subcollection is now polymorphic.
// Every question carries a `kind` discriminator; existing MCQ docs without one
// are treated as "mcq" by readers.
// ============================================================================

export type QuestionKind = "mcq" | "theory";

export type TheoryQuestionType = "short_answer" | "essay" | "fill_blank" | "structured";

export type McqOption = "A" | "B" | "C" | "D";

export interface MCQQuestion extends WithId {
  kind: "mcq";
  questionText: string;
  options: string[]; // length 4
  correctAnswer: McqOption;
  order?: number;
  createdAt?: unknown;
}

// One row of an essay marking rubric: "rows of { criterion, maxMarks, descriptor }".
export interface MarkingRubric {
  criterion: string;
  maxMarks: number;
  descriptor: string;
}

// A sub-part of a structured question. Total marks = sum of subQuestion maxMarks.
export interface SubQuestion {
  id: string;
  text: string;
  markingScheme: string;
  maxMarks: number;
  order: number;
}

interface TheoryQuestionBase extends WithId {
  kind: "theory";
  type: TheoryQuestionType;
  questionText: string;
  maxMarks: number;
  order?: number;
  wordLimit?: number;
  createdAt?: unknown;
}

export interface ShortAnswerQuestion extends TheoryQuestionBase {
  type: "short_answer";
  markingScheme: string; // "what a correct answer should include"
  sampleAnswer?: string; // helps the AI marker
}

export interface EssayMarkingScheme {
  content: string; // facts/points expected
  structure: string; // intro / body / conclusion expectations
  language: string; // grammar / vocabulary expectations
}

export interface EssayQuestion extends TheoryQuestionBase {
  type: "essay";
  markingScheme: EssayMarkingScheme;
  rubric: MarkingRubric[];
}

export interface FillBlankQuestion extends TheoryQuestionBase {
  type: "fill_blank";
  sentence: string; // contains one or more [BLANK] markers
  acceptableAnswers: string[]; // case-insensitive match; graded WITHOUT AI
  exactMatch: boolean;
}

export interface StructuredQuestion extends TheoryQuestionBase {
  type: "structured";
  // questionText holds the parent scenario/passage; maxMarks auto = Σ subQuestions.maxMarks
  subQuestions: SubQuestion[];
}

export type TheoryQuestion =
  | ShortAnswerQuestion
  | EssayQuestion
  | FillBlankQuestion
  | StructuredQuestion;

export type ExamQuestion = MCQQuestion | TheoryQuestion;

// ============================================================================
// Exam sections
// ============================================================================

export type ExamSectionKind = "mcq" | "theory";

export interface MCQExamSection {
  id: string;
  kind: "mcq";
  label: string; // "Section A"
  instructions?: string;
  order: number;
  timeAllocationMinutes?: number;
}

export interface TheoryExamSection {
  id: string;
  kind: "theory";
  label: string; // "Section B"
  instructions: string;
  order: number;
  timeAllocationMinutes?: number; // optional separate timer
}

export type ExamSection = MCQExamSection | TheoryExamSection;

// Extends the existing loose Exam with section configuration.
export interface ExamWithSections extends Exam {
  hasMCQ: boolean;
  hasTheory: boolean;
  sections: ExamSection[];
}

// ============================================================================
// AI marking
// ============================================================================

export type AIConfidence = "high" | "medium" | "low";

export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Provider-agnostic AI marking output for one answer (Gemini today).
export interface AIMarkingResult {
  suggestedScore: number; // ALWAYS clamped server-side to [0, maxMarks]
  reasoning: string;
  confidence: AIConfidence;
  model: string; // e.g. "gemini-2.5-flash" — auditable source
  usage?: AITokenUsage;
  markedAt?: unknown;
  error?: string; // set when the marking attempt failed (status ai_error)
}

// ============================================================================
// Student submission of theory answers
// ============================================================================

export type TheorySubmissionStatus =
  | "pending_ai" // written, AI marking not yet run
  | "ai_marking" // AI pass in progress
  | "ai_marked" // AI suggestions ready for tutor review
  | "ai_error" // AI failed; needs manual review
  | "in_review" // tutor has started marking (progress saved)
  | "finalised"; // released to the student

export type AnswerReviewStatus =
  | "pending" // awaiting AI or deterministic grade
  | "ai_suggested" // AI produced a suggestion; awaiting tutor
  | "auto_marked" // fill_blank graded deterministically
  | "tutor_marked"; // tutor set the final score

// A graded sub-part of a structured question.
export interface SubAnswer {
  subQuestionId: string;
  studentAnswer: string;
  maxMarks: number;
  ai?: AIMarkingResult;
  tutorScore?: number; // 0..maxMarks
  tutorComment?: string;
  finalScore?: number;
}

export interface TheoryAnswer {
  questionId: string;
  type: TheoryQuestionType;
  maxMarks: number;
  studentAnswer: string; // empty for structured (uses subAnswers)
  subAnswers?: SubAnswer[]; // structured only
  ai?: AIMarkingResult; // non-structured; fill_blank is auto-graded, no AI
  tutorScore?: number; // 0..maxMarks
  tutorComment?: string;
  finalScore?: number; // tutorScore (or auto grade) once marked
  reviewStatus: AnswerReviewStatus;
}

export interface TheorySubmission extends WithId {
  schoolId: string;
  tutorId: string; // owning tutor (exam.tutorId) — drives tutor-scoped reads
  examId: string;
  examTitle: string;
  resultId: string; // links to /results/{id}
  studentName: string;
  studentId?: string;
  classId?: string;
  status: TheorySubmissionStatus;
  answers: TheoryAnswer[];
  theoryTotal: number; // Σ maxMarks across answers
  theoryAwarded?: number; // Σ finalScore once finalised
  priority: boolean; // true if any answer AI confidence is "low"
  submittedAt?: unknown;
  submittedAtMs: number;
  aiMarkedAt?: unknown;
  finalisedAt?: unknown;
  finalisedBy?: string; // tutor uid
}

// ============================================================================
// Result extension — a mixed result stays pending until the tutor finalises.
// ============================================================================

export type ResultCompletionStatus = "complete" | "pending_theory";

export interface MixedResult extends Result {
  hasMCQ: boolean;
  hasTheory: boolean;
  completionStatus: ResultCompletionStatus;
  mcqScore?: number;
  mcqTotal?: number;
  theorySubmissionId?: string;
  combinedScore?: number;
  combinedTotal?: number;
  combinedPercentage?: number;
}

// ============================================================================
// Notifications (lightweight, in-app)
// ============================================================================

export type NotificationType = "theory_ready_for_review" | "theory_ai_error";

export interface AppNotification extends WithId {
  schoolId: string;
  recipientId: string; // tutor uid
  type: NotificationType;
  title: string;
  body: string;
  submissionId?: string;
  examId?: string;
  read: boolean;
  createdAt?: unknown;
  createdAtMs: number;
}
// Spec alias — the DOM lib already declares a global `Notification`, so the app
// type is named AppNotification; import this alias where the spec's name is expected.
export type Notification = AppNotification;

// ============================================================================
// AI generation request (extends the existing question-generation feature)
// ============================================================================

export interface GenerateTheoryQuestionsRequest {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: TheoryQuestionType;
  count: number;
  schoolId: string;
  gradeLevel: string;
}

// ============================================================================
// Type guards
// ============================================================================

export function isTheoryQuestion(q: ExamQuestion): q is TheoryQuestion {
  return q.kind === "theory";
}

export function isMCQQuestion(q: ExamQuestion): q is MCQQuestion {
  return q.kind === "mcq";
}

export function isStructured(q: TheoryQuestion): q is StructuredQuestion {
  return q.type === "structured";
}

// Effective max marks: structured questions derive theirs from their sub-parts.
export function questionMaxMarks(q: TheoryQuestion): number {
  if (q.type === "structured") {
    return q.subQuestions.reduce((sum, sub) => sum + sub.maxMarks, 0);
  }
  return q.maxMarks;
}
