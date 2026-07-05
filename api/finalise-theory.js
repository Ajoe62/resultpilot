// POST /api/finalise-theory   (owning tutor or school admin)
// Body: { submissionId }
// Authoritatively releases a theory submission: clamps every score to its
// maxMarks server-side (never trust the client), combines with the MCQ result,
// evaluates pass/fail against the exam pass mark, and marks it complete.

import { getAdmin, getDb } from "./_lib/firebaseAdmin.js";

function bearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1] : "";
}

function clamp(value, maxMarks) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Number(maxMarks) || 0, n));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const submissionId = String(body.submissionId ?? "").trim();
  if (!submissionId) {
    res.status(400).json({ error: "submissionId is required." });
    return;
  }

  const admin = getAdmin();
  const db = getDb();

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  try {
    const ref = db.collection("theorySubmissions").doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    const submission = snap.data();

    // Authorise: the owning tutor or a school admin (claims or legacy).
    const isOwningTutor =
      decoded.role === "tutor" &&
      decoded.active === true &&
      decoded.uid === submission.tutorId &&
      decoded.schoolId === submission.schoolId;
    let isAdmin =
      decoded.role === "schooladmin" && decoded.active === true && decoded.schoolId === submission.schoolId;
    if (!isOwningTutor && !isAdmin) {
      const adminDoc = await db.collection("admins").doc(decoded.uid).get();
      isAdmin = adminDoc.exists;
    }
    if (!isOwningTutor && !isAdmin) {
      res.status(403).json({ error: "You can't finalise this submission." });
      return;
    }

    if (submission.status === "finalised") {
      res.status(200).json({ success: true, alreadyFinalised: true });
      return;
    }

    // Clamp every tutor score server-side and total the theory marks.
    const answers = Array.isArray(submission.answers) ? submission.answers : [];
    let theoryAwarded = 0;
    const finalAnswers = answers.map((answer) => {
      if (answer.type === "structured") {
        const subAnswers = (answer.subAnswers || []).map((sub) => {
          const finalScore = clamp(sub.tutorScore ?? sub.finalScore ?? sub.ai?.suggestedScore ?? 0, sub.maxMarks);
          return { ...sub, tutorScore: finalScore, finalScore };
        });
        const finalScore = subAnswers.reduce((sum, sub) => sum + sub.finalScore, 0);
        theoryAwarded += finalScore;
        return { ...answer, subAnswers, finalScore, reviewStatus: "tutor_marked" };
      }
      const finalScore = clamp(answer.tutorScore ?? answer.finalScore ?? answer.ai?.suggestedScore ?? 0, answer.maxMarks);
      theoryAwarded += finalScore;
      return { ...answer, tutorScore: finalScore, finalScore, reviewStatus: "tutor_marked" };
    });

    const theoryTotal =
      Number(submission.theoryTotal) || answers.reduce((sum, answer) => sum + (Number(answer.maxMarks) || 0), 0);

    // Combine with the objective result.
    const resultRef = db.collection("results").doc(submission.resultId);
    const resultSnap = await resultRef.get();
    const result = resultSnap.exists ? resultSnap.data() : {};
    const mcqScore = Number(result.mcqScore ?? result.score ?? 0);
    const mcqTotal = Number(result.mcqTotal ?? result.total ?? 0);
    const combinedScore = mcqScore + theoryAwarded;
    const combinedTotal = mcqTotal + theoryTotal;
    const combinedPercentage = combinedTotal ? Math.round((combinedScore / combinedTotal) * 100) : 0;

    // Pass mark comes from the exam.
    let passmark = 0;
    if (submission.examId) {
      const examSnap = await db.collection("exams").doc(submission.examId).get();
      passmark = Number(examSnap.exists ? examSnap.data().passmark : 0) || 0;
    }
    const passed = combinedPercentage >= passmark;

    const { FieldValue } = admin.firestore;
    const batch = db.batch();
    batch.update(ref, {
      answers: finalAnswers,
      status: "finalised",
      theoryAwarded,
      finalisedAt: FieldValue.serverTimestamp(),
      finalisedBy: decoded.uid,
    });
    batch.set(
      resultRef,
      {
        hasTheory: true,
        theorySubmissionId: submissionId,
        theoryAwarded,
        theoryTotal,
        mcqScore,
        mcqTotal,
        combinedScore,
        combinedTotal,
        combinedPercentage,
        // The overall result now reflects the combined score.
        score: combinedScore,
        total: combinedTotal,
        percentage: combinedPercentage,
        passed,
        completionStatus: "complete",
        finalisedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();

    res.status(200).json({
      success: true,
      mcqScore,
      mcqTotal,
      theoryAwarded,
      theoryTotal,
      combinedScore,
      combinedTotal,
      combinedPercentage,
      passed,
    });
  } catch (error) {
    console.error("finalise-theory failed", error);
    res.status(500).json({ error: "Could not finalise. Please try again." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
