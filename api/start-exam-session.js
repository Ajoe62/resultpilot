// POST /api/start-exam-session   (public — stateless student PIN access)
// Body: { fullName, admissionNumber, classId, className, schoolId, schoolName,
//         subject, pin }
// Vercel equivalent of the startExamSession callable, for Spark-plan projects.
// Returns the client-safe session (questions without correct answers).

import { getAdmin, getDb } from "./_lib/firebaseAdmin.js";
import { startExamSession, ExamFlowError } from "./_lib/examFlow.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    const session = await startExamSession(getDb(), getAdmin(), body);
    res.status(200).json(session);
  } catch (error) {
    if (error instanceof ExamFlowError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("start-exam-session failed", error);
    res.status(500).json({ error: "Unable to start the exam. Please try again." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
