// POST /api/admin/deactivate-tutor   (school-admin only)
// Body: { tutorUid, reactivate? }
// Sets the tutor's `active` claim to false (or true to re-enable), revokes their
// refresh tokens so the change takes effect on the next request, disables the
// auth account, and flips the profile flag. A stale Firestore flag alone would
// leave an existing token valid until expiry, so we revoke + disable at the
// Auth layer where it is actually enforced.

import { getAdmin, getDb } from "../_lib/firebaseAdmin.js";
import { requireSchoolAdmin, AuthError } from "../_lib/requireAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    const caller = await requireSchoolAdmin(req);
    const tutorUid = String(body.tutorUid ?? "").trim();
    const reactivate = Boolean(body.reactivate);

    if (!tutorUid) {
      res.status(400).json({ error: "tutorUid is required." });
      return;
    }

    const admin = getAdmin();
    const db = getDb();

    // Confirm the tutor belongs to the caller's school before touching Auth.
    const tutorRef = db.doc(`schools/${caller.schoolId}/tutors/${tutorUid}`);
    const tutorSnap = await tutorRef.get();
    if (!tutorSnap.exists) {
      res.status(404).json({ error: "Tutor not found in your school." });
      return;
    }

    const active = reactivate;
    await admin.auth().setCustomUserClaims(tutorUid, {
      role: "tutor",
      schoolId: caller.schoolId,
      active,
    });
    await admin.auth().revokeRefreshTokens(tutorUid);
    await admin.auth().updateUser(tutorUid, { disabled: !active });

    const { FieldValue } = admin.firestore;
    await tutorRef.update({ active, deactivatedAt: active ? null : FieldValue.serverTimestamp() });

    await db.collection("adminAuditLogs").add({
      action: active ? "tutor_reactivated" : "tutor_deactivated",
      actorUid: caller.uid,
      schoolId: caller.schoolId,
      targetUid: tutorUid,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, uid: tutorUid, active });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("deactivate-tutor failed", error);
    res.status(500).json({ error: error?.message || "Failed to update tutor." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
