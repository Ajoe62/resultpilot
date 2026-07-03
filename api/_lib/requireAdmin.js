// Verifies that a request comes from a signed-in ResultPilot admin.
// The client sends its Firebase ID token as `Authorization: Bearer <token>`.
// We verify the token and confirm an admins/{uid} document exists, mirroring
// the Firestore security-rule isAdmin() check. Protects the Gemini-spending
// endpoints (ingest, source generation) from abuse.

import { getAdmin, getDb } from "./firebaseAdmin.js";

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function extractBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1] : "";
}

/** Returns the admin's uid, or throws AuthError. */
export async function requireAdmin(req) {
  const token = extractBearer(req);
  if (!token) {
    throw new AuthError("Missing authorization token.");
  }

  // Initialize outside the verify try so a missing/invalid service account
  // surfaces as its own clear error instead of being mislabeled a token error.
  const adminApp = getAdmin();

  let decoded;
  try {
    decoded = await adminApp.auth().verifyIdToken(token);
  } catch (verifyError) {
    throw new AuthError(
      `Invalid or expired authorization token: ${verifyError?.message || verifyError}`,
    );
  }

  const adminDoc = await getDb().collection("admins").doc(decoded.uid).get();
  if (!adminDoc.exists) {
    throw new AuthError("You do not have admin access.", 403);
  }
  return decoded.uid;
}

// Verifies the caller is a SCHOOL ADMIN and returns { uid, schoolId }.
// Accepts either a claims-based schooladmin (request.auth.token.role) or a
// legacy root /admins/{uid} doc (transition). Legacy admins are treated as the
// admin of DEFAULT_SCHOOL_ID (single-tenant origin). Used by the tutor
// provisioning endpoints so an admin can only act within their own school.
export async function requireSchoolAdmin(req) {
  const token = extractBearer(req);
  if (!token) {
    throw new AuthError("Missing authorization token.");
  }

  const adminApp = getAdmin();

  let decoded;
  try {
    decoded = await adminApp.auth().verifyIdToken(token);
  } catch (verifyError) {
    throw new AuthError(
      `Invalid or expired authorization token: ${verifyError?.message || verifyError}`,
    );
  }

  if (decoded.role === "schooladmin" && decoded.active === true && decoded.schoolId) {
    return { uid: decoded.uid, schoolId: String(decoded.schoolId) };
  }

  // Legacy fallback: root admins collection.
  const adminDoc = await getDb().collection("admins").doc(decoded.uid).get();
  if (adminDoc.exists) {
    const defaultSchoolId = String(process.env.DEFAULT_SCHOOL_ID || "").trim();
    if (!defaultSchoolId) {
      throw new AuthError(
        "Server misconfigured: DEFAULT_SCHOOL_ID is not set for legacy admin.",
        500,
      );
    }
    return { uid: decoded.uid, schoolId: defaultSchoolId };
  }

  throw new AuthError("School admin access is required.", 403);
}
