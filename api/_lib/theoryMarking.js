// AI marking for theory submissions (Gemini). Called after submission (via
// /api/mark-theory) — never awaited by the student. Marking schemes / answer
// keys are read from the examSessions ledger (never exposed to students).
// Scores are clamped to [0, maxMarks]; a parse/API failure after one retry is
// saved as a low-confidence suggestion flagged for priority tutor review.

import { generateContent, DEFAULT_MODEL } from "./gemini.js";

const CONFIDENCE = ["high", "medium", "low"];
// Do not re-mark submissions a tutor may already be reviewing / has finalised.
const REMARKABLE = ["pending_ai", "ai_marking", "ai_error"];

function clampScore(value, maxMarks) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Number(maxMarks) || 0, n));
}

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// One AI marking call with a single retry. Always resolves to an AIMarkingResult.
async function markOne({ questionText, markingScheme, sampleAnswer, maxMarks, studentAnswer, model }) {
  const system =
    "You are a fair, consistent exam marker. Mark the student's answer strictly against the marking scheme. " +
    'Respond with ONLY a JSON object: {"score": <integer from 0 to the max marks>, ' +
    '"reasoning": <one or two sentences>, "confidence": "high" | "medium" | "low"}.';
  const user = [
    `Question: ${questionText}`,
    `Max marks: ${maxMarks}`,
    `Marking scheme: ${markingScheme}`,
    sampleAnswer ? `Sample answer: ${sampleAnswer}` : "",
    `Student answer: ${studentAnswer || "(no answer provided)"}`,
    "",
    "Return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await generateContent({
        system,
        user,
        model,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      });
      const parsed = parseJson(text);
      return {
        suggestedScore: clampScore(parsed.score, maxMarks),
        reasoning: String(parsed.reasoning || "").slice(0, 1000),
        confidence: CONFIDENCE.includes(parsed.confidence) ? parsed.confidence : "medium",
        model,
        markedAtMs: Date.now(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    suggestedScore: 0,
    reasoning: "Automatic marking failed; please review this answer manually.",
    confidence: "low",
    model,
    markedAtMs: Date.now(),
    error: String(lastError?.message || lastError || "unknown"),
  };
}

// Marks every pending answer in a submission, updates it to ai_marked, and
// notifies the owning tutor. Idempotent: no-op once a tutor is reviewing.
export async function markSubmission(db, admin, submissionId) {
  const ref = db.collection("theorySubmissions").doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) return { skipped: "not_found" };

  const submission = snap.data();
  if (!REMARKABLE.includes(submission.status)) return { skipped: submission.status };

  await ref.update({ status: "ai_marking" });

  // Marking schemes live on the session, keyed by the same doc id as the result.
  const sessionSnap = await db.collection("examSessions").doc(submission.resultId).get();
  const theoryQuestions =
    sessionSnap.exists && Array.isArray(sessionSnap.data().theoryQuestions)
      ? sessionSnap.data().theoryQuestions
      : [];
  const byId = new Map(theoryQuestions.map((q) => [q.id, q]));

  const model = process.env.GEMINI_MARK_MODEL || DEFAULT_MODEL;
  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  let priority = false;

  const marked = [];
  for (const answer of answers) {
    if (answer.reviewStatus === "auto_marked") {
      marked.push(answer); // fill_blank already graded deterministically
      continue;
    }

    const question = byId.get(answer.questionId) || {};

    if (answer.type === "structured") {
      const subMeta = new Map((question.subQuestions || []).map((s) => [s.id, s]));
      const subAnswers = [];
      for (const sub of answer.subAnswers || []) {
        const meta = subMeta.get(sub.subQuestionId) || {};
        const ai = await markOne({
          questionText: `${question.questionText || ""}\nSub-question: ${meta.text || ""}`,
          markingScheme: meta.markingScheme || "",
          maxMarks: sub.maxMarks,
          studentAnswer: sub.studentAnswer,
          model,
        });
        if (ai.confidence === "low") priority = true;
        subAnswers.push({ ...sub, ai });
      }
      marked.push({ ...answer, subAnswers, reviewStatus: "ai_suggested" });
    } else {
      const scheme =
        answer.type === "essay" && question.markingScheme && typeof question.markingScheme === "object"
          ? `Content: ${question.markingScheme.content}\nStructure: ${question.markingScheme.structure}\nLanguage: ${question.markingScheme.language}`
          : question.markingScheme || "";
      const ai = await markOne({
        questionText: question.questionText || "",
        markingScheme: scheme,
        sampleAnswer: question.sampleAnswer,
        maxMarks: answer.maxMarks,
        studentAnswer: answer.studentAnswer,
        model,
      });
      if (ai.confidence === "low") priority = true;
      marked.push({ ...answer, ai, reviewStatus: "ai_suggested" });
    }
  }

  const { FieldValue } = admin.firestore;
  await ref.update({
    answers: marked,
    status: "ai_marked",
    priority,
    aiMarkedAt: FieldValue.serverTimestamp(),
  });

  // Notify the owning tutor (harmless no-op recipient for legacy/school-owned exams).
  await db.collection("notifications").add({
    schoolId: submission.schoolId,
    recipientId: submission.tutorId,
    type: "theory_ready_for_review",
    title: "Theory answers ready for review",
    body: `${submission.studentName || "A student"} — ${submission.examTitle || "exam"}`,
    submissionId,
    examId: submission.examId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  });

  return { marked: marked.length, priority };
}
