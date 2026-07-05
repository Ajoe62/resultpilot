// Server-side exam session + grading, ported from the Firebase callable
// functions (functions/index.js) so it runs on Vercel for free (Spark plan).
// The Admin SDK bypasses security rules, so students stay unauthenticated and
// answer keys / grading never touch the client. Results are stamped with the
// exam's schoolId + tutorId for multi-tenant, tutor-scoped reads.

const SUBMISSION_GRACE_MS = 30 * 1000;
const ASSESSMENT_MAX_SCORES = {
  first_assessment: 20,
  second_assessment: 20,
  exam: 60,
};
const DEFAULT_ASSESSMENT_TYPE = "exam";

export class ExamFlowError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ExamFlowError";
    this.status = status;
  }
}

function normalizeAssessmentType(value) {
  return Object.prototype.hasOwnProperty.call(ASSESSMENT_MAX_SCORES, value)
    ? value
    : DEFAULT_ASSESSMENT_TYPE;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupKey(value) {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";
  return text.trim().toLowerCase();
}

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function validateStudentPayload(data) {
  const student = {
    id: cleanString(data.studentId),
    fullName: cleanString(data.fullName),
    admissionNumber: cleanString(data.admissionNumber),
    classId: cleanString(data.classId),
    className: cleanString(data.className),
    schoolId: cleanString(data.schoolId),
    schoolName: cleanString(data.schoolName),
  };
  const subject = cleanString(data.subject);
  const pin = cleanString(data.pin);

  if (!student.fullName || !student.className || !student.schoolName) {
    throw new ExamFlowError("Complete all student details.");
  }
  if (!subject || !pin) {
    throw new ExamFlowError("Subject and PIN are required.");
  }
  return { student, subject, pin };
}

function validateQuestion(question, questionId) {
  const questionText = cleanString(question.questionText);
  const options = Array.isArray(question.options)
    ? question.options.map((option) => cleanString(option))
    : [];
  const correctAnswer = cleanString(question.correctAnswer);

  if (!questionText || options.length !== 4 || options.some((option) => !option)) {
    throw new ExamFlowError(`Question ${questionId} is invalid and cannot be delivered.`, 422);
  }
  if (!["A", "B", "C", "D"].includes(correctAnswer)) {
    throw new ExamFlowError(`Question ${questionId} has an invalid correct answer.`, 422);
  }
  return { id: questionId, questionText, options, correctAnswer };
}

function validateExam(exam, examId) {
  const title = cleanString(exam.title);
  const subject = cleanString(exam.subject);
  const academicSession = cleanString(exam.academicSession);
  const term = cleanString(exam.term);
  const pin = cleanString(exam.pin);
  const duration = Number(exam.duration);
  const passmark = Number(exam.passmark);
  const assessmentType = normalizeAssessmentType(exam.assessmentType);
  const assessmentMaxScore = Number(
    exam.assessmentMaxScore || ASSESSMENT_MAX_SCORES[assessmentType],
  );

  if (!title || !subject || !pin) {
    throw new ExamFlowError(`Exam ${examId} is missing required fields.`, 422);
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
    throw new ExamFlowError(`Exam ${examId} has an invalid duration.`, 422);
  }
  if (!Number.isFinite(passmark) || passmark < 0 || passmark > 100) {
    throw new ExamFlowError(`Exam ${examId} has an invalid pass mark.`, 422);
  }

  return {
    id: examId,
    title,
    subject,
    academicSession,
    term,
    duration,
    passmark,
    assessmentType,
    assessmentMaxScore,
    // Multi-tenant attribution carried onto sessions + results.
    schoolId: cleanString(exam.schoolId),
    tutorId: cleanString(exam.tutorId) || "legacy",
  };
}

function sanitizeAnswers(answers, questions) {
  const safeAnswers = {};
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return safeAnswers;
  }
  for (const question of questions) {
    const selected = answers[question.id];
    safeAnswers[question.id] = ["A", "B", "C", "D"].includes(selected) ? selected : null;
  }
  return safeAnswers;
}

// ---------------- theory ----------------

const THEORY_TYPES = ["short_answer", "essay", "fill_blank", "structured"];
const MAX_ANSWER_WORDS = 2000;

function normalizeTheoryType(value) {
  return THEORY_TYPES.includes(value) ? value : "short_answer";
}

function truncateWords(value, maxWords = MAX_ANSWER_WORDS) {
  const text = cleanString(value);
  if (!text) return "";
  const words = text.split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(" ");
}

// Full (server-side) theory question — keeps marking schemes / answer keys that
// must never reach the student.
function normalizeTheoryQuestion(id, data) {
  const type = normalizeTheoryType(data.type);
  const question = {
    id,
    type,
    questionText: cleanString(data.questionText),
    maxMarks: Number(data.maxMarks) || 0,
  };
  const wordLimit = Number(data.wordLimit);
  if (wordLimit > 0) question.wordLimit = wordLimit;

  if (type === "short_answer") {
    question.markingScheme = cleanString(data.markingScheme);
    if (cleanString(data.sampleAnswer)) question.sampleAnswer = cleanString(data.sampleAnswer);
  } else if (type === "essay") {
    const scheme = data.markingScheme;
    question.markingScheme =
      scheme && typeof scheme === "object"
        ? { content: cleanString(scheme.content), structure: cleanString(scheme.structure), language: cleanString(scheme.language) }
        : { content: cleanString(scheme), structure: "", language: "" };
    question.rubric = Array.isArray(data.rubric) ? data.rubric : [];
  } else if (type === "fill_blank") {
    question.sentence = cleanString(data.sentence || data.questionText);
    question.acceptableAnswers = Array.isArray(data.acceptableAnswers)
      ? data.acceptableAnswers.map((answer) => String(answer))
      : [];
    question.exactMatch = data.exactMatch === true;
  } else {
    question.subQuestions = Array.isArray(data.subQuestions)
      ? data.subQuestions.map((sub, index) => ({
          id: cleanString(sub.id) || `sub-${index}`,
          text: cleanString(sub.text),
          markingScheme: cleanString(sub.markingScheme),
          maxMarks: Number(sub.maxMarks) || 0,
        }))
      : [];
    question.maxMarks = question.subQuestions.reduce((sum, sub) => sum + sub.maxMarks, 0) || question.maxMarks;
  }
  return question;
}

// Strips marking schemes / answer keys for the student-facing session.
function clientSafeTheory(question) {
  const safe = {
    id: question.id,
    type: question.type,
    questionText: question.questionText,
    maxMarks: question.maxMarks,
  };
  if (question.wordLimit) safe.wordLimit = question.wordLimit;
  if (question.type === "fill_blank") safe.sentence = question.sentence;
  if (question.type === "structured") {
    safe.subQuestions = (question.subQuestions || []).map((sub) => ({ id: sub.id, text: sub.text, maxMarks: sub.maxMarks }));
  }
  return safe;
}

function matchFillBlank(answer, acceptableAnswers, exactMatch) {
  const value = cleanString(answer);
  return (acceptableAnswers || []).some((candidate) => {
    const target = cleanString(candidate);
    return exactMatch ? value === target : value.toLowerCase() === target.toLowerCase();
  });
}

// Builds one stored TheoryAnswer from the student's submitted answer. fill_blank
// is graded deterministically here; everything else is left pending for AI.
function buildTheoryAnswer(question, submitted) {
  const maxMarks = Number(question.maxMarks) || 0;

  if (question.type === "structured") {
    const subAnswers = (question.subQuestions || []).map((sub) => ({
      subQuestionId: sub.id,
      studentAnswer: truncateWords((submitted.subAnswers || {})[sub.id]),
      maxMarks: Number(sub.maxMarks) || 0,
    }));
    return { questionId: question.id, type: "structured", maxMarks, studentAnswer: "", subAnswers, reviewStatus: "pending" };
  }

  const studentAnswer = truncateWords(submitted.studentAnswer);

  if (question.type === "fill_blank") {
    const finalScore = matchFillBlank(studentAnswer, question.acceptableAnswers, question.exactMatch) ? maxMarks : 0;
    return { questionId: question.id, type: "fill_blank", maxMarks, studentAnswer, tutorScore: finalScore, finalScore, reviewStatus: "auto_marked" };
  }

  return { questionId: question.id, type: question.type, maxMarks, studentAnswer, reviewStatus: "pending" };
}

// Matches an active exam by subject + PIN and creates an examSessions ledger doc
// holding the answer key. Returns the client-safe session (no correctAnswer).
export async function startExamSession(db, admin, data) {
  const { student, subject, pin } = validateStudentPayload(data ?? {});
  const subjectKey = normalizeLookupKey(subject);
  const pinKey = normalizeLookupKey(pin);

  const examSnapshot = await db.collection("exams").where("isActive", "==", true).get();
  const matching = examSnapshot.docs.filter((examDoc) => {
    const examData = examDoc.data();
    return (
      normalizeLookupKey(examData.subjectKey || examData.subject) === subjectKey &&
      normalizeLookupKey(examData.pinKey || examData.pin) === pinKey
    );
  });

  if (!matching.length) {
    throw new ExamFlowError("No active exam matches that subject and access PIN.", 404);
  }
  if (matching.length > 1) {
    throw new ExamFlowError("Multiple active exams match this subject and PIN.", 409);
  }

  const examDoc = matching[0];
  const exam = validateExam(examDoc.data(), examDoc.id);

  const questionsSnapshot = await examDoc.ref.collection("questions").orderBy("createdAt", "asc").get();
  // Objective (MCQ) questions are auto-graded in this session; theory questions
  // live in the same subcollection but are graded separately (server + tutor).
  const mcqDocs = questionsSnapshot.docs.filter((doc) => doc.data().kind !== "theory");
  const theoryDocs = questionsSnapshot.docs.filter((doc) => doc.data().kind === "theory");
  if (!mcqDocs.length && !theoryDocs.length) {
    throw new ExamFlowError("This exam has no questions yet. Contact the tutor.", 422);
  }

  const questionSet = shuffleArray(
    mcqDocs.map((questionDoc) => validateQuestion(questionDoc.data(), questionDoc.id)),
  );
  const theoryQuestions = theoryDocs.map((questionDoc) => normalizeTheoryQuestion(questionDoc.id, questionDoc.data()));
  const examData = examDoc.data();
  const theorySection = {
    label: cleanString(examData.theorySectionLabel) || "Section B",
    instructions: cleanString(examData.theoryInstructions),
  };

  const startedAt = Date.now();
  const endsAt = startedAt + exam.duration * 60 * 1000;
  const sessionRef = db.collection("examSessions").doc();

  await sessionRef.set({
    student,
    exam,
    questions: questionSet,
    theoryQuestions,
    hasTheory: theoryQuestions.length > 0,
    theorySection,
    status: "in_progress",
    startedAtMs: startedAt,
    endsAtMs: endsAt,
    schoolId: exam.schoolId,
    tutorId: exam.tutorId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    sessionId: sessionRef.id,
    student,
    exam,
    questions: questionSet.map(({ correctAnswer, ...question }) => question),
    theoryQuestions: theoryQuestions.map(clientSafeTheory),
    hasMCQ: questionSet.length > 0,
    hasTheory: theoryQuestions.length > 0,
    theorySection,
    answers: {},
    theoryAnswers: {},
    currentIndex: 0,
    startedAt,
    endsAt,
    submittedResult: null,
    status: "in_progress",
  };
}

// Grades a session against its stored answer key inside a transaction and writes
// the result (idempotent — a resubmit returns the stored result).
export async function submitExam(db, admin, data) {
  const sessionId = cleanString(data?.sessionId);
  const answerPayload = data?.answers;
  if (!sessionId) {
    throw new ExamFlowError("Session ID is required.");
  }

  const { FieldValue } = admin.firestore;

  return db.runTransaction(async (transaction) => {
    const sessionRef = db.collection("examSessions").doc(sessionId);
    const resultRef = db.collection("results").doc(sessionId);
    const sessionSnapshot = await transaction.get(sessionRef);

    if (!sessionSnapshot.exists) {
      throw new ExamFlowError("Exam session not found.", 404);
    }

    const session = sessionSnapshot.data();

    if (session.status === "submitted") {
      const existing = await transaction.get(resultRef);
      if (!existing.exists) {
        throw new ExamFlowError("Session was already submitted but the result is missing.", 409);
      }
      return existing.data().clientResult;
    }

    const questions = Array.isArray(session.questions) ? session.questions : [];
    const theoryQuestions = Array.isArray(session.theoryQuestions) ? session.theoryQuestions : [];
    if (!questions.length && !theoryQuestions.length) {
      throw new ExamFlowError("Session has no questions.", 422);
    }

    const submittedAtMs = Date.now();
    const endsAtMs = Number(session.endsAtMs || 0);
    if (endsAtMs && submittedAtMs > endsAtMs + SUBMISSION_GRACE_MS) {
      throw new ExamFlowError("This exam session has expired.", 410);
    }

    const answers = sanitizeAnswers(answerPayload, questions);
    const reviewItems = questions.map((question) => {
      const selected = answers[question.id] ?? null;
      const correct = question.correctAnswer;
      return {
        questionId: question.id,
        questionText: question.questionText,
        options: question.options,
        selected,
        correct,
        isCorrect: selected === correct,
      };
    });

    const score = reviewItems.filter((item) => item.isCorrect).length;
    const total = reviewItems.length;
    const percentage = total ? Math.round((score / total) * 100) : 0;
    const timeTaken = Math.max(
      0,
      Math.round((submittedAtMs - Number(session.startedAtMs || submittedAtMs)) / 1000),
    );
    const passed = percentage >= Number(session.exam?.passmark || 0);

    let assessmentType = normalizeAssessmentType(session.exam.assessmentType);
    let assessmentMaxScore = Number(
      session.exam.assessmentMaxScore || ASSESSMENT_MAX_SCORES[assessmentType],
    );
    let schoolId = cleanString(session.exam.schoolId) || cleanString(session.schoolId);
    let tutorId = cleanString(session.exam.tutorId) || cleanString(session.tutorId) || "legacy";

    if (session.exam?.id) {
      const latestExamSnapshot = await transaction.get(db.collection("exams").doc(session.exam.id));
      if (latestExamSnapshot.exists) {
        const latestExam = latestExamSnapshot.data();
        assessmentType = normalizeAssessmentType(latestExam.assessmentType);
        assessmentMaxScore = Number(latestExam.assessmentMaxScore || ASSESSMENT_MAX_SCORES[assessmentType]);
        schoolId = cleanString(latestExam.schoolId) || schoolId;
        tutorId = cleanString(latestExam.tutorId) || tutorId;
      }
    }

    // Theory capture: fill_blank is graded deterministically now; the rest is
    // saved pending for AI marking (triggered after submission) + tutor review.
    const hasMCQ = questions.length > 0;
    const hasTheory = theoryQuestions.length > 0;
    const theoryAnswersPayload =
      data && typeof data.theoryAnswers === "object" && data.theoryAnswers ? data.theoryAnswers : {};
    let theorySubmissionId = null;
    let theoryStatus = null;
    if (hasTheory) {
      theorySubmissionId = sessionId;
      const theoryAnswersOut = theoryQuestions.map((question) =>
        buildTheoryAnswer(question, theoryAnswersPayload[question.id] || {}),
      );
      const theoryTotal = theoryQuestions.reduce((sum, question) => sum + (Number(question.maxMarks) || 0), 0);
      theoryStatus = theoryAnswersOut.some((answer) => answer.reviewStatus === "pending") ? "pending_ai" : "ai_marked";
      transaction.set(db.collection("theorySubmissions").doc(theorySubmissionId), {
        schoolId,
        tutorId,
        examId: session.exam.id,
        examTitle: session.exam.title,
        resultId: sessionId,
        studentName: session.student.fullName,
        studentId: session.student.id || "",
        classId: session.student.classId || "",
        status: theoryStatus,
        answers: theoryAnswersOut,
        theoryTotal,
        priority: false,
        submittedAt: FieldValue.serverTimestamp(),
        submittedAtMs,
      });
    }
    const completionStatus = hasTheory ? "pending_theory" : "complete";

    const clientResult = {
      id: sessionId,
      studentName: session.student.fullName,
      studentId: session.student.id || "",
      class: session.student.className,
      classId: session.student.classId || "",
      school: session.student.schoolName,
      schoolId,
      admissionNumber: session.student.admissionNumber || "",
      subject: session.exam.subject,
      academicSession: session.exam.academicSession || "Unspecified Session",
      term: session.exam.term || "Unspecified Term",
      examId: session.exam.id,
      examTitle: session.exam.title,
      tutorId,
      assessmentType,
      assessmentMaxScore,
      score,
      total,
      percentage,
      timeTaken,
      passed,
      submittedAtMs,
      hasMCQ,
      hasTheory,
      mcqScore: score,
      mcqTotal: total,
      mcqPercentage: percentage,
      completionStatus,
      theorySubmissionId,
      theoryStatus,
      answers: reviewItems.map((item) => ({
        questionId: item.questionId,
        selected: item.selected,
        correct: item.correct,
      })),
      reviewItems,
    };

    transaction.set(resultRef, {
      studentName: clientResult.studentName,
      studentId: clientResult.studentId,
      class: clientResult.class,
      classId: clientResult.classId,
      school: clientResult.school,
      schoolId: clientResult.schoolId,
      admissionNumber: clientResult.admissionNumber,
      subject: clientResult.subject,
      academicSession: clientResult.academicSession,
      term: clientResult.term,
      examId: clientResult.examId,
      examTitle: clientResult.examTitle,
      tutorId: clientResult.tutorId,
      assessmentType: clientResult.assessmentType,
      assessmentMaxScore: clientResult.assessmentMaxScore,
      score: clientResult.score,
      total: clientResult.total,
      percentage: clientResult.percentage,
      timeTaken: clientResult.timeTaken,
      passed: clientResult.passed,
      answers: clientResult.answers,
      submittedAt: FieldValue.serverTimestamp(),
      submittedAtMs,
      hasMCQ: clientResult.hasMCQ,
      hasTheory: clientResult.hasTheory,
      mcqScore: clientResult.mcqScore,
      mcqTotal: clientResult.mcqTotal,
      mcqPercentage: clientResult.mcqPercentage,
      completionStatus: clientResult.completionStatus,
      theorySubmissionId: clientResult.theorySubmissionId,
      clientResult,
    });

    transaction.update(sessionRef, {
      status: "submitted",
      submittedAtMs,
      submittedResult: clientResult,
    });

    return clientResult;
  });
}
