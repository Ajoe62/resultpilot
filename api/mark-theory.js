// POST /api/mark-theory   (public trigger; idempotent, server-guarded)
// Body: { submissionId }
// Runs AI marking on a theory submission. Called right after submission (by the
// student's client, fire-and-forget) and as a retry from the tutor queue. It is
// idempotent — a no-op once a tutor is reviewing or the submission is finalised.

import { getAdmin, getDb } from "./_lib/firebaseAdmin.js";
import { markSubmission } from "./_lib/theoryMarking.js";

export const config = { maxDuration: 60 };

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

  try {
    const result = await markSubmission(getDb(), getAdmin(), submissionId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("mark-theory failed", error);
    // Surface the failure to the tutor as an error status they can retry from.
    try {
      await getDb().collection("theorySubmissions").doc(submissionId).update({ status: "ai_error" });
    } catch {
      /* ignore */
    }
    res.status(500).json({ error: "AI marking failed. It can be retried from the marking queue." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
