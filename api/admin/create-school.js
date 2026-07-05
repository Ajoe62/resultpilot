// POST /api/admin/create-school   (school-admin / owner)
// Body: { name, address? }
// Creates a new school and grants the caller access to it by appending the new
// school id to their `schoolIds` custom claim (additive — no token revoke, so
// the caller stays signed in; a token refresh picks it up).

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
    const name = String(body.name ?? "").trim();
    const address = String(body.address ?? "").trim();
    if (name.length < 2) {
      res.status(400).json({ error: "A school name is required." });
      return;
    }

    const admin = getAdmin();
    const db = getDb();
    const { FieldValue } = admin.firestore;

    // Create the school.
    const schoolRef = await db.collection("schools").add({
      name,
      address,
      isActive: true,
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const newSchoolId = schoolRef.id;

    // Add the caller to the new school's admin roster.
    await db.doc(`schools/${newSchoolId}/admins/${caller.uid}`).set(
      { uid: caller.uid, role: "schooladmin", createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    // Merge the new school into the caller's claims (preserve existing).
    const user = await admin.auth().getUser(caller.uid);
    const existing = user.customClaims || {};
    const primarySchool = existing.schoolId || caller.schoolId;
    const schoolIds = Array.isArray(existing.schoolIds) && existing.schoolIds.length
      ? [...new Set([...existing.schoolIds.map(String), newSchoolId])]
      : [...new Set([primarySchool, newSchoolId].filter(Boolean))];

    await admin.auth().setCustomUserClaims(caller.uid, {
      role: "schooladmin",
      schoolId: primarySchool,
      schoolIds,
      active: true,
    });

    res.status(200).json({ success: true, schoolId: newSchoolId, schoolIds });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("create-school failed", error);
    res.status(500).json({ error: error?.message || "Failed to create school." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
