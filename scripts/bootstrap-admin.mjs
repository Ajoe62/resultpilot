// One-time bootstrap: turn the existing single-tenant admin into a claims-based
// SCHOOL ADMIN and create the school + per-school admin roster. Run this ONCE
// per school (Admin SDK, uses a service account — bypasses security rules).
//
//   node scripts/bootstrap-admin.mjs \
//     --service-account ./service-account.json \
//     --school-id default-school \
//     --school-name "Sunrise Academy" \
//     --admin-email proprietor@school.com     # or --admin-uid <uid>
//     [--dry-run]
//
// After running, the admin must sign out/in (or wait for token refresh) so the
// new custom claims land in their ID token.

import fs from "fs";
import admin from "firebase-admin";

function getArgValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) return process.argv[idx + 1]?.trim() || fallback;
  return fallback;
}

const serviceAccountPath = getArgValue("service-account", "./service-account.json");
const schoolId = getArgValue("school-id", process.env.DEFAULT_SCHOOL_ID || "");
const schoolName = getArgValue("school-name", "Default School");
const adminUidArg = getArgValue("admin-uid", "");
const adminEmail = getArgValue("admin-email", "");
const dryRun = process.argv.includes("--dry-run");

if (!schoolId) {
  throw new Error("Missing --school-id (or DEFAULT_SCHOOL_ID env).");
}
if (!adminUidArg && !adminEmail) {
  throw new Error("Provide --admin-uid or --admin-email to identify the admin.");
}
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Missing ${serviceAccountPath}. Download a Firebase service account key.`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const adminUser = adminUidArg
  ? await auth.getUser(adminUidArg)
  : await auth.getUserByEmail(adminEmail);

const uid = adminUser.uid;
const email = (adminUser.email || adminEmail || "").toLowerCase();
const claims = { role: "schooladmin", schoolId, active: true };

console.log(
  `Bootstrapping school "${schoolName}" (${schoolId})\n  admin: ${email || "(no email)"} [${uid}]\n  claims: ${JSON.stringify(claims)}`,
);

if (dryRun) {
  console.log("Dry run — no changes written.");
  process.exit(0);
}

await auth.setCustomUserClaims(uid, claims);
await auth.revokeRefreshTokens(uid);

await db.collection("schools").doc(schoolId).set(
  { name: schoolName, isActive: true, updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

await db.doc(`schools/${schoolId}/admins/${uid}`).set(
  { uid, email, role: "schooladmin", createdAt: FieldValue.serverTimestamp() },
  { merge: true },
);

console.log("Done. The admin should sign out and back in to refresh their token.");
process.exit(0);
