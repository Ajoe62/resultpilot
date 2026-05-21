const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const db = admin.firestore();
const { FieldValue } = admin.firestore;
const SUBMISSION_GRACE_MS = 30 * 1000;
const ASSESSMENT_MAX_SCORES = {
  first_assessment: 20,
  second_assessment: 20,
  exam: 60,
};
const DEFAULT_ASSESSMENT_TYPE = "exam";
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  admin.app().options.projectId ||
  "";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAssessmentType(value) {
  return Object.prototype.hasOwnProperty.call(ASSESSMENT_MAX_SCORES, value)
    ? value
    : DEFAULT_ASSESSMENT_TYPE;
}

function getCallableOptions() {
  const allowedOrigins = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];

  if (projectId) {
    allowedOrigins.push(
      new RegExp(`^https://${escapeRegExp(projectId)}\\.web\\.app$`),
    );
    allowedOrigins.push(
      new RegExp(`^https://${escapeRegExp(projectId)}\\.firebaseapp\\.com$`),
    );
  }

  return {
    region: "us-central1",
    cors: allowedOrigins,
  };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
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
    throw new HttpsError("invalid-argument", "Complete all student details.");
  }

  if (!subject || !pin) {
    throw new HttpsError("invalid-argument", "Subject and PIN are required.");
  }

  return { student, subject, pin };
}

function validateQuestion(question, questionId) {
  const questionText = cleanString(question.questionText);
  const options = Array.isArray(question.options)
    ? question.options.map((option) => cleanString(option))
    : [];
  const correctAnswer = cleanString(question.correctAnswer);

  if (
    !questionText ||
    options.length !== 4 ||
    options.some((option) => !option)
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Question ${questionId} is invalid and cannot be delivered.`,
    );
  }

  if (!["A", "B", "C", "D"].includes(correctAnswer)) {
    throw new HttpsError(
      "failed-precondition",
      `Question ${questionId} has an invalid correct answer.`,
    );
  }

  return {
    id: questionId,
    questionText,
    options,
    correctAnswer,
  };
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
    throw new HttpsError(
      "failed-precondition",
      `Exam ${examId} is missing required fields.`,
    );
  }

  if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
    throw new HttpsError(
      "failed-precondition",
      `Exam ${examId} has an invalid duration.`,
    );
  }

  if (!Number.isFinite(passmark) || passmark < 0 || passmark > 100) {
    throw new HttpsError(
      "failed-precondition",
      `Exam ${examId} has an invalid pass mark.`,
    );
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
  };
}

function sanitizeAnswers(answers, questions) {
  const safeAnswers = {};

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return safeAnswers;
  }

  for (const question of questions) {
    const selected = answers[question.id];
    safeAnswers[question.id] = ["A", "B", "C", "D"].includes(selected)
      ? selected
      : null;
  }

  return safeAnswers;
}

async function assertAdmin(uid) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const adminSnapshot = await db.collection("admins").doc(uid).get();
  if (!adminSnapshot.exists) {
    throw new HttpsError("permission-denied", "Admin access is required.");
  }
}

exports.startExamSession = onCall(getCallableOptions(), async (request) => {
  const { student, subject, pin } = validateStudentPayload(request.data ?? {});

  const examSnapshot = await db
    .collection("exams")
    .where("subject", "==", subject)
    .where("pin", "==", pin)
    .where("isActive", "==", true)
    .get();

  if (examSnapshot.empty) {
    throw new HttpsError(
      "not-found",
      "No active exam matches that subject and access PIN.",
    );
  }

  if (examSnapshot.size > 1) {
    throw new HttpsError(
      "failed-precondition",
      "Multiple active exams match this subject and PIN.",
    );
  }

  const examDoc = examSnapshot.docs[0];
  const exam = validateExam(examDoc.data(), examDoc.id);

  const questionsSnapshot = await examDoc.ref
    .collection("questions")
    .orderBy("createdAt", "asc")
    .get();

  if (questionsSnapshot.empty) {
    throw new HttpsError(
      "failed-precondition",
      "This exam has no questions yet. Contact the tutor.",
    );
  }

  const questionSet = shuffleArray(
    questionsSnapshot.docs.map((questionDoc) =>
      validateQuestion(questionDoc.data(), questionDoc.id),
    ),
  ).slice(0, 10);

  const startedAt = Date.now();
  const endsAt = startedAt + exam.duration * 60 * 1000;
  const sessionRef = db.collection("examSessions").doc();

  await sessionRef.set({
    student,
    exam,
    questions: questionSet,
    status: "in_progress",
    startedAtMs: startedAt,
    endsAtMs: endsAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    sessionId: sessionRef.id,
    student,
    exam,
    questions: questionSet.map(({ correctAnswer, ...question }) => question),
    answers: {},
    currentIndex: 0,
    startedAt,
    endsAt,
    submittedResult: null,
    status: "in_progress",
  };
});

exports.submitExam = onCall(getCallableOptions(), async (request) => {
  const sessionId = cleanString(request.data?.sessionId);
  const answerPayload = request.data?.answers;

  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Session ID is required.");
  }

  const result = await db.runTransaction(async (transaction) => {
    const sessionRef = db.collection("examSessions").doc(sessionId);
    const resultRef = db.collection("results").doc(sessionId);
    const sessionSnapshot = await transaction.get(sessionRef);

    if (!sessionSnapshot.exists) {
      throw new HttpsError("not-found", "Exam session not found.");
    }

    const session = sessionSnapshot.data();

    if (session.status === "submitted") {
      const existingResultSnapshot = await transaction.get(resultRef);
      if (!existingResultSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Session was already submitted but the result is missing.",
        );
      }

      return existingResultSnapshot.data().clientResult;
    }

    const questions = Array.isArray(session.questions) ? session.questions : [];
    if (!questions.length) {
      throw new HttpsError("failed-precondition", "Session has no questions.");
    }

    const submittedAtMs = Date.now();
    const endsAtMs = Number(session.endsAtMs || 0);

    if (endsAtMs && submittedAtMs > endsAtMs + SUBMISSION_GRACE_MS) {
      throw new HttpsError(
        "deadline-exceeded",
        "This exam session has expired.",
      );
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
      Math.round(
        (submittedAtMs - Number(session.startedAtMs || submittedAtMs)) / 1000,
      ),
    );
    const passed = percentage >= Number(session.exam?.passmark || 0);

    const clientResult = {
      id: sessionId,
      studentName: session.student.fullName,
      studentId: session.student.id || "",
      class: session.student.className,
      classId: session.student.classId || "",
      school: session.student.schoolName,
      schoolId: session.student.schoolId || "",
      admissionNumber: session.student.admissionNumber || "",
      subject: session.exam.subject,
      academicSession: session.exam.academicSession || "Unspecified Session",
      term: session.exam.term || "Unspecified Term",
      examId: session.exam.id,
      examTitle: session.exam.title,
      assessmentType: normalizeAssessmentType(session.exam.assessmentType),
      assessmentMaxScore: Number(
        session.exam.assessmentMaxScore ||
          ASSESSMENT_MAX_SCORES[normalizeAssessmentType(session.exam.assessmentType)],
      ),
      score,
      total,
      percentage,
      timeTaken,
      passed,
      submittedAtMs,
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
      clientResult,
    });

    transaction.update(sessionRef, {
      status: "submitted",
      submittedAtMs,
      submittedResult: clientResult,
    });

    return clientResult;
  });

  return result;
});

exports.deleteExam = onCall(getCallableOptions(), async (request) => {
  await assertAdmin(request.auth?.uid);

  const examId = cleanString(request.data?.examId);
  if (!examId) {
    throw new HttpsError("invalid-argument", "Exam ID is required.");
  }

  const examRef = db.collection("exams").doc(examId);
  const examSnapshot = await examRef.get();

  if (!examSnapshot.exists) {
    throw new HttpsError("not-found", "Exam not found.");
  }

  await db.recursiveDelete(examRef);

  return { success: true };
});
