// POST /api/admin/set-claims   (school-admin only)
// Body: { targetUid, role, active? }
// Grants a role within the CALLER'S OWN school by writing Firebase Auth custom
// claims { role, schoolId, active }. Rules then read the token with zero reads.
// A school admin can only set claims for their own schoolId — never cross-school.

import { getAdmin, getDb } from "../_lib/firebaseAdmin.js";
import { requireSchoolAdmin, AuthError } from "../_lib/requireAdmin.js";

const ROLES = new Set(["schooladmin", "tutor"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    const caller = await requireSchoolAdmin(req);

    const targetUid = String(body.targetUid ?? "").trim();
    const role = String(body.role ?? "").trim();
    const active = body.active === undefined ? true : Boolean(body.active);

    if (!targetUid) {
      res.status(400).json({ error: "targetUid is required." });
      return;
    }
    if (!ROLES.has(role)) {
      res.status(400).json({ error: "role must be 'schooladmin' or 'tutor'." });
      return;
    }

    const admin = getAdmin();

    // The target must exist and, if already claimed, must belong to this school.
    let targetUser;
    try {
      targetUser = await admin.auth().getUser(targetUid);
    } catch {
      res.status(404).json({ error: "Target user not found." });
      return;
    }

    const existing = targetUser.customClaims || {};
    if (existing.schoolId && existing.schoolId !== caller.schoolId) {
      res.status(403).json({ error: "That user belongs to a different school." });
      return;
    }

    const claims = { role, schoolId: caller.schoolId, active };
    await admin.auth().setCustomUserClaims(targetUid, claims);
    // Force the next token refresh to pick up the new claims.
    await admin.auth().revokeRefreshTokens(targetUid);

    await getDb()
      .collection("adminAuditLogs")
      .add({
        action: "set_claims",
        actorUid: caller.uid,
        schoolId: caller.schoolId,
        targetUid,
        claims,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(200).json({ success: true, uid: targetUid, claims });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error?.message || "Failed to set claims." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
