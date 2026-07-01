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
