// Make an admin a multi-school OWNER: sets a `schoolIds` custom claim (the set
// of schools they may manage) and adds them to each school's admin roster. Run
// once with the Admin SDK service account (bypasses security rules).
//
//   node scripts/grant-owner.mjs \
//     --service-account ./service-account.json \
//     --admin-email owner@group.com   (or --admin-uid <uid>) \
//     --school-ids schoolA,schoolB,schoolC
//     [--dry-run]
//
// The first id becomes the caller's primary `schoolId`; all are in `schoolIds`.
// After running, the owner should sign out/in (tokens are revoked) to pick up
// the new claim, then use the in-app School Switcher.

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
const adminUidArg = getArgValue("admin-uid", "");
const adminEmail = getArgValue("admin-email", "");
const schoolIdsArg = getArgValue("school-ids", "");
const dryRun = process.argv.includes("--dry-run");

const schoolIds = [...new Set(schoolIdsArg.split(",").map((s) => s.trim()).filter(Boolean))];

if (!adminUidArg && !adminEmail) {
  throw new Error("Provide --admin-uid or --admin-email.");
}
if (schoolIds.length === 0) {
  throw new Error("Provide --school-ids (comma-separated /schools document ids).");
}
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Missing ${serviceAccountPath}. Download a Firebase service account key.`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const user = adminUidArg ? await auth.getUser(adminUidArg) : await auth.getUserByEmail(adminEmail);
const uid = user.uid;
const email = (user.email || adminEmail || "").toLowerCase();
const claims = { role: "schooladmin", schoolId: schoolIds[0], schoolIds, active: true };

console.log(`Granting owner: ${email || "(no email)"} [${uid}]\n  schoolIds: ${schoolIds.join(", ")}`);

if (dryRun) {
  console.log("Dry run — no changes written.");
  process.exit(0);
}

await auth.setCustomUserClaims(uid, claims);
await auth.revokeRefreshTokens(uid);

for (const schoolId of schoolIds) {
  await db.doc(`schools/${schoolId}/admins/${uid}`).set(
    { uid, email, role: "schooladmin", createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

console.log("Done. The owner should sign out and back in to refresh their token.");
process.exit(0);
