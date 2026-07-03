// Phase 2 — multi-tenant backfill migration (Admin SDK, bypasses rules).
//
// Because ResultPilot keeps FLAT collections and adds discriminator fields
// (schoolId, tutorId, classId), this migration is an idempotent, in-place
// FIELD BACKFILL — not a copy-then-cutover. Nothing is deleted, so it is safe to
// re-run and trivially reversible. Existing docs that already carry schoolId are
// skipped.
//
//   node scripts/migrate-multitenant.mjs \
//     --service-account ./service-account.json \
//     --school-id default-school \
//     [--tutor-id legacy] [--class-id legacy] [--dry-run]
//
// It also ensures the /schools/{schoolId} doc exists. Run bootstrap-admin.mjs
// first so an admin owns the school.

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
const schoolId = getArgValue("school-id", process.env.DEFAULT_SCHOOL_ID || process.env.VITE_DEFAULT_SCHOOL_ID || "");
const legacyTutorId = getArgValue("tutor-id", "legacy");
const legacyClassId = getArgValue("class-id", "legacy");
const dryRun = process.argv.includes("--dry-run");
const BATCH_LIMIT = 400; // Firestore caps a batch at 500 writes; stay under.

if (!schoolId) {
  throw new Error("Missing --school-id (or DEFAULT_SCHOOL_ID env).");
}
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Missing ${serviceAccountPath}. Download a Firebase service account key.`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Per-collection: which fields to backfill when missing.
const PLAN = {
  exams: { schoolId: true, tutorId: true },
  results: { schoolId: true, tutorId: true, classId: true },
  students: { schoolId: true },
  classes: { schoolId: true },
};

function buildPatch(collection, data) {
  const fields = PLAN[collection];
  const patch = {};
  if (fields.schoolId && !data.schoolId) patch.schoolId = schoolId;
  if (fields.tutorId && !data.tutorId) patch.tutorId = legacyTutorId;
  // Students usually already have classId; only fill when truly absent.
  if (fields.classId && !data.classId) patch.classId = legacyClassId;
  return patch;
}

async function migrateCollection(name) {
  const snapshot = await db.collection(name).get();
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let batch = db.batch();
  let ops = 0;

  for (const docSnap of snapshot.docs) {
    try {
      const patch = buildPatch(name, docSnap.data() || {});
      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        patch.migratedV2At = admin.firestore.FieldValue.serverTimestamp();
        batch.set(docSnap.ref, patch, { merge: true });
        ops += 1;
        if (ops >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      updated += 1;
    } catch (error) {
      errors += 1;
      console.error(`  ! ${name}/${docSnap.id} failed:`, error.message);
    }
  }

  if (!dryRun && ops > 0) {
    await batch.commit();
  }

  console.log(
    `${name}: ${updated} ${dryRun ? "would update" : "updated"}, ${skipped} already scoped, ${errors} errors (of ${snapshot.size})`,
  );
  return { updated, skipped, errors };
}

console.log(
  `Backfilling schoolId="${schoolId}", tutorId="${legacyTutorId}", classId="${legacyClassId}"${dryRun ? "  [DRY RUN]" : ""}\n`,
);

// Ensure the school shell exists (non-destructive merge).
if (!dryRun) {
  await db.collection("schools").doc(schoolId).set(
    { migratedV2At: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
}

const totals = { updated: 0, skipped: 0, errors: 0 };
for (const name of Object.keys(PLAN)) {
  const result = await migrateCollection(name);
  totals.updated += result.updated;
  totals.skipped += result.skipped;
  totals.errors += result.errors;
}

console.log(
  `\nTotal: ${totals.updated} updated, ${totals.skipped} skipped, ${totals.errors} errors.` +
    (dryRun ? "\nDry run — no writes performed." : ""),
);
process.exit(totals.errors > 0 ? 1 : 0);
