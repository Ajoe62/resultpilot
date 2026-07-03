// POST /api/submit-exam   (public — stateless student submission)
// Body: { sessionId, answers }
// Vercel equivalent of the submitExam callable, for Spark-plan projects. Grades
// server-side against the stored answer key and writes the result via Admin SDK
// (bypasses rules — the score is not client-controlled). Idempotent.

import { getAdmin, getDb } from "./_lib/firebaseAdmin.js";
import { submitExam, ExamFlowError } from "./_lib/examFlow.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    const result = await submitExam(getDb(), getAdmin(), body);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ExamFlowError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("submit-exam failed", error);
    res.status(500).json({ error: "Unable to submit the exam. Please try again." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
