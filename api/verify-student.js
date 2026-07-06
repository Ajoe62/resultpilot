// Anti-impersonation check for exam start. PUBLIC (the student isn't signed in),
// so the per-student secret can't live on the publicly-readable /students doc —
// it lives in the private /studentAccess/{studentId} collection and is verified
// here with the Admin SDK (which bypasses security rules).
//
// Fail-open when no code has been provisioned for a student yet (hasCode:false),
// so existing rosters keep working during rollout; once an admin generates a
// code, an empty/wrong entry is rejected.

import { getDb } from "./_lib/firebaseAdmin.js";

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const studentId = String(body.studentId ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();

  if (!studentId) {
    res.status(400).json({ error: "studentId is required." });
    return;
  }

  try {
    const snap = await getDb().doc(`studentAccess/${studentId}`).get();

    if (!snap.exists) {
      // Not yet secured — allow through so pre-existing students still start.
      res.status(200).json({ valid: true, hasCode: false });
      return;
    }

    const expected = String(snap.data()?.code ?? "").trim().toUpperCase();
    if (expected && expected === code) {
      res.status(200).json({ valid: true, hasCode: true });
      return;
    }

    res
      .status(401)
      .json({ valid: false, error: "Incorrect access code for the selected student." });
  } catch (error) {
    console.error("verify-student failed", error);
    res.status(500).json({ error: error?.message || "Could not verify access code." });
  }
}
