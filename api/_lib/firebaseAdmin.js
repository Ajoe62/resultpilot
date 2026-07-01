// Lazily initialized Firebase Admin SDK for serverless functions.
// Reads a service account from the FIREBASE_SERVICE_ACCOUNT env var (the full
// JSON string, or base64-encoded JSON). Admin access bypasses security rules,
// so functions can serve unauthenticated students without exposing embeddings.

import admin from "firebase-admin";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not configured. Add your Firebase service account JSON to the server environment.",
    );
  }
  const text = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64 JSON).");
  }
}

export function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(parseServiceAccount()) });
  }
  return admin;
}

export function getDb() {
  return getAdmin().firestore();
}
