// School-admin actions, consolidated into one module so they can be served by a
// SINGLE Vercel serverless function (api/admin/[action].js) — Vercel's Hobby
// plan caps a deployment at 12 functions. Behavior is unchanged; only the file
// layout differs. Each export is a Vercel-style (req, res) handler.

import crypto from "node:crypto";
import { getAdmin, getDb } from "./firebaseAdmin.js";
import { requireSchoolAdmin, AuthError } from "./requireAdmin.js";

const ROLES = new Set(["schooladmin", "tutor"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function readBody(req) {
  return typeof req.body === "string" ? safeParse(req.body) : req.body || {};
}

function requirePost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return false;
  }
  return true;
}

// ---------------- set-claims ----------------
export async function setClaims(req, res) {
  if (!requirePost(req, res)) return;
  const body = readBody(req);
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
    await admin.auth().revokeRefreshTokens(targetUid);

    await getDb().collection("adminAuditLogs").add({
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

// ---------------- deactivate-tutor ----------------
export async function deactivateTutor(req, res) {
  if (!requirePost(req, res)) return;
  const body = readBody(req);
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

    const tutorRef = db.doc(`schools/${caller.schoolId}/tutors/${tutorUid}`);
    const tutorSnap = await tutorRef.get();
    if (!tutorSnap.exists) {
      res.status(404).json({ error: "Tutor not found in your school." });
      return;
    }

    const active = reactivate;
    await admin.auth().setCustomUserClaims(tutorUid, { role: "tutor", schoolId: caller.schoolId, active });
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

// ---------------- invite-tutor ----------------
export async function inviteTutor(req, res) {
  if (!requirePost(req, res)) return;
  const body = readBody(req);
  try {
    const caller = await requireSchoolAdmin(req);

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const assignedClasses = Array.isArray(body.assignedClasses)
      ? [...new Set(body.assignedClasses.map((c) => String(c)).filter(Boolean))]
      : [];

    if (name.length < 2) {
      res.status(400).json({ error: "Tutor name is required." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    const admin = getAdmin();
    const db = getDb();
    const { FieldValue } = admin.firestore;

    try {
      await admin.auth().getUserByEmail(email);
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    } catch (lookupError) {
      if (lookupError?.code !== "auth/user-not-found") throw lookupError;
    }

    // Flat collection keyed by the token (direct get on accept; no index).
    const token = crypto.randomUUID();
    await db.doc(`tutorInvites/${token}`).set({
      token,
      name,
      email,
      assignedClasses,
      schoolId: caller.schoolId,
      accepted: false,
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    const origin =
      String(process.env.APP_ORIGIN || "").trim() ||
      String(req.headers.origin || "").trim() ||
      (req.headers.host ? `https://${req.headers.host}` : "https://resultpilot.app");
    const inviteLink = `${origin.replace(/\/$/, "")}/auth/invite/${token}`;

    let schoolName = "your school";
    try {
      const schoolSnap = await db.collection("schools").doc(caller.schoolId).get();
      if (schoolSnap.exists && schoolSnap.data()?.name) schoolName = schoolSnap.data().name;
    } catch {
      /* non-fatal */
    }

    const emailed = await sendInviteEmail({ to: email, name, schoolName, inviteLink });

    res.status(200).json({ success: true, inviteLink, emailed });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("invite-tutor failed", error);
    res.status(500).json({ error: error?.message || "Failed to create invite." });
  }
}

// ---------------- create-school ----------------
export async function createSchool(req, res) {
  if (!requirePost(req, res)) return;
  const body = readBody(req);
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

    const schoolRef = await db.collection("schools").add({
      name,
      address,
      isActive: true,
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const newSchoolId = schoolRef.id;

    await db.doc(`schools/${newSchoolId}/admins/${caller.uid}`).set(
      { uid: caller.uid, role: "schooladmin", createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    const user = await admin.auth().getUser(caller.uid);
    const existing = user.customClaims || {};
    const primarySchool = existing.schoolId || caller.schoolId;
    const schoolIds =
      Array.isArray(existing.schoolIds) && existing.schoolIds.length
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

// Resend REST email (no SDK). Returns false — without throwing — when email
// isn't configured/fails, so the invite still succeeds and the link is shared.
async function sendInviteEmail({ to, name, schoolName, inviteLink }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM || "ResultPilot <onboarding@resend.dev>";
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#111">
      <h2>You've been invited to ResultPilot</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>You've been invited to join <strong>${escapeHtml(schoolName)}</strong> as a tutor on ResultPilot.</p>
      <p>Click below to set your password and activate your account:</p>
      <p><a href="${inviteLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Accept invitation</a></p>
      <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${inviteLink}</p>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: `You're invited to ${schoolName} on ResultPilot`, html }),
    });
    if (!response.ok) {
      console.error("Resend send failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend request errored", error);
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
