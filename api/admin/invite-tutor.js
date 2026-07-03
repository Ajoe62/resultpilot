// POST /api/admin/invite-tutor   (school-admin only)
// Body: { name, email, assignedClasses[] }
// Creates a pending tutor invite under the caller's school and (if Resend is
// configured) emails the invitation link. The token lives only in Firestore
// (never returned to non-admins) and is consumed by /api/auth/accept-invite.
// If email isn't configured the link is returned so the admin can share it.

import crypto from "node:crypto";
import { getAdmin, getDb } from "../_lib/firebaseAdmin.js";
import { requireSchoolAdmin, AuthError } from "../_lib/requireAdmin.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // Reject if the email already has an account (they'd sign in, not accept).
    try {
      await admin.auth().getUserByEmail(email);
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    } catch (lookupError) {
      if (lookupError?.code !== "auth/user-not-found") throw lookupError;
    }

    const token = crypto.randomUUID();
    const inviteId = crypto.randomUUID();
    await db.doc(`schools/${caller.schoolId}/tutorInvites/${inviteId}`).set({
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

// Sends via the Resend REST API (no SDK dependency). Returns false — without
// throwing — when email isn't configured or the send fails, so the invite still
// succeeds and the admin can share the returned link manually.
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

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
