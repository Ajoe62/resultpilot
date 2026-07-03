// POST /api/auth/accept-invite   (public — the tutor has no account yet)
// Body: { token, password }
// Completes a tutor invitation ATOMICALLY and server-side, closing the
// client-side privilege-escalation hole in the original plan:
//   1. look up the (unused) invite by token via the Admin SDK
//   2. create the Firebase Auth account
//   3. stamp custom claims { role:'tutor', schoolId, active:true }
//   4. write the tutor profile at /schools/{schoolId}/tutors/{uid}
//   5. mark the invite accepted and clear its token
// If any step after account creation fails, the new auth user is rolled back so
// no orphan account is left behind. The client never writes the tutor doc.

import { getAdmin, getDb } from "../_lib/firebaseAdmin.js";

const MIN_PASSWORD = 8;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  if (!token) {
    res.status(400).json({ error: "Invitation token is required." });
    return;
  }
  if (password.length < MIN_PASSWORD) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    return;
  }

  const admin = getAdmin();
  const db = getDb();

  let createdUid = null;
  try {
    // 1. Find the pending invite (token is never exposed to clients).
    const snap = await db
      .collectionGroup("tutorInvites")
      .where("token", "==", token)
      .where("accepted", "==", false)
      .limit(1)
      .get();

    if (snap.empty) {
      res.status(400).json({ error: "This invitation is invalid or has already been used." });
      return;
    }

    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data();
    const schoolId = String(invite.schoolId ?? "").trim();
    const email = String(invite.email ?? "").trim().toLowerCase();
    const name = String(invite.name ?? "").trim();
    const assignedClasses = Array.isArray(invite.assignedClasses)
      ? invite.assignedClasses.map((c) => String(c)).filter(Boolean)
      : [];

    if (!schoolId || !email) {
      res.status(422).json({ error: "This invitation is malformed. Ask your admin to resend it." });
      return;
    }

    // 2. Reject if the email is already registered.
    try {
      await admin.auth().getUserByEmail(email);
      res.status(409).json({ error: "An account already exists for this email. Try signing in instead." });
      return;
    } catch (lookupError) {
      if (lookupError?.code !== "auth/user-not-found") {
        throw lookupError;
      }
    }

    const user = await admin.auth().createUser({ email, password, displayName: name || undefined });
    createdUid = user.uid;

    // 3. Custom claims — role/schoolId/active read by security rules.
    await admin.auth().setCustomUserClaims(createdUid, {
      role: "tutor",
      schoolId,
      active: true,
    });

    // 4 + 5. Profile + invite close-out in one atomic batch.
    const { FieldValue } = admin.firestore;
    const batch = db.batch();
    const tutorRef = db.doc(`schools/${schoolId}/tutors/${createdUid}`);
    batch.set(tutorRef, {
      uid: createdUid,
      name,
      email,
      assignedClasses,
      schoolId,
      role: "tutor",
      active: true,
      inviteAccepted: true,
      createdAt: FieldValue.serverTimestamp(),
      acceptedAt: FieldValue.serverTimestamp(),
      lastActiveAt: FieldValue.serverTimestamp(),
    });
    batch.update(inviteDoc.ref, {
      accepted: true,
      acceptedByUid: createdUid,
      acceptedAt: FieldValue.serverTimestamp(),
      token: FieldValue.delete(),
    });
    await batch.commit();

    res.status(200).json({ success: true, schoolId, email });
  } catch (error) {
    // Roll back the auth account if we got past creation.
    if (createdUid) {
      try {
        await admin.auth().deleteUser(createdUid);
      } catch (rollbackError) {
        console.error("accept-invite rollback failed", rollbackError);
      }
    }
    console.error("accept-invite failed", error);
    res.status(500).json({ error: "Could not complete the invitation. Please try again or contact your admin." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
