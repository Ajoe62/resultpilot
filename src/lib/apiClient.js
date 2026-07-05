// Thin client for the /api serverless functions. Admin-only endpoints receive
// the caller's Firebase ID token so the server can verify admin access.

import { auth } from "./firebase";

async function getAdminToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in as an admin.");
  }
  return user.getIdToken();
}

async function postJson(path, body, { withAuth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth) {
    headers.Authorization = `Bearer ${await getAdminToken()}`;
  }

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

export function ingestDocument(body) {
  return postJson("/api/ingest-document", body, { withAuth: true });
}

export function generateFromDocument(body) {
  return postJson("/api/generate-from-document", body, { withAuth: true });
}

export function deleteStudyDocument(documentId) {
  return postJson("/api/delete-document", { documentId }, { withAuth: true });
}

export function ragQuery(body) {
  return postJson("/api/rag-query", body);
}

// --- multi-tenant: tutor provisioning (school-admin authed) ---

export function inviteTutor(body) {
  return postJson("/api/admin/invite-tutor", body, { withAuth: true });
}

export function setTutorClaims(body) {
  return postJson("/api/admin/set-claims", body, { withAuth: true });
}

export function deactivateTutor(tutorUid, reactivate = false) {
  return postJson("/api/admin/deactivate-tutor", { tutorUid, reactivate }, { withAuth: true });
}

// Public — the invited tutor has no account yet.
export function acceptInvite(body) {
  return postJson("/api/auth/accept-invite", body);
}

// --- server-graded exam flow (VITE_EXAM_SECURITY_MODE=vercel). Public: students
// are stateless. Grading + result writes happen server-side (Admin SDK). ---

export function startExamSessionRequest(body) {
  return postJson("/api/start-exam-session", body);
}

export function submitExamRequest(body) {
  return postJson("/api/submit-exam", body);
}

// Public trigger for AI marking of a theory submission (fire-and-forget after
// exam submission; idempotent + server-guarded).
export function markTheory(body) {
  return postJson("/api/mark-theory", body);
}

// Tutor/admin releases a theory submission: server clamps scores, computes the
// combined result, and marks it complete.
export function finaliseTheory(submissionId) {
  return postJson("/api/finalise-theory", { submissionId }, { withAuth: true });
}
