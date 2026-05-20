# ResultPilot

ResultPilot is a React + Firebase programming assessment app for students and tutors.

## Stack

- React + Vite
- Firebase Firestore
- Firebase Authentication
- Optional Firebase Cloud Functions for the later secure grading upgrade
- Firebase Hosting

## Features

- Student registration with exam PIN validation
- Timed one-question-at-a-time exam flow
- Random question shuffling per session
- Auto-submit on timeout
- Client-side grading for the free MVP
- Optional server-side grading when Cloud Functions are enabled
- Academic session and term tracking
- Animated results and answer review
- Admin login and dashboard
- Exam management
- Question management
- Results filtering and CSV export
- Free-plan Google Sheets export from the admin browser session
- Printable PDF result sheets and downloadable DOC result sheets
- Student lookup across attempts

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your Firebase project values.
   The `.env` file is ignored by git on purpose so local secrets and project IDs
   are not committed.
   Also copy `.firebaserc.example` to `.firebaserc` and set the default Firebase project ID.

3. Create one admin user in Firebase Authentication with email/password sign-in enabled.

4. In Firestore, create an allowlist document at `/admins/{uid}` for each admin user.
   The document ID must be the Firebase Auth UID of that admin account.

5. Start the app:

```bash
npm run dev
```

## Firebase Config Values

Get these from Firebase Console > Project settings > Your apps > Web app config:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

If those values are missing or still set to placeholders, the app now renders a
setup screen instead of failing silently.

## Local Development Modes

You have two valid ways to run the app locally:

- Use a real Firebase project:
  Fill `.env` with your real Firebase web app config, create `.firebaserc`, and deploy Hosting plus Firestore config.
- Use Firebase emulators:
  Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env`, then start Firebase emulators
  for Auth and Firestore before running `npm run dev`.

## Exam Security Mode

The MVP defaults to the free Firebase Spark-compatible mode:

```env
VITE_EXAM_SECURITY_MODE=client
```

In this mode, students can take exams without Cloud Functions. The tradeoff is
that grading happens in the browser, so this is acceptable for an MVP or low-risk
assessment flow, but it is not tamper-proof.

When the project is ready for stronger exam integrity, switch to:

```env
VITE_EXAM_SECURITY_MODE=functions
```

That mode uses Cloud Functions for exam delivery and grading, so students do not
receive answer keys from Firestore. Deploying Firebase Cloud Functions requires
the Blaze pay-as-you-go plan, so keep `client` mode for the free MVP.

## Google Sheets Export

The MVP uses browser-based Google OAuth so it does not require Cloud Functions or
a service account private key. Add these optional values to `.env`:

```env
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_SHEET_ID=
```

Setup:

1. In Google Cloud Console, enable the Google Sheets API.
2. Create an OAuth 2.0 Client ID for a Web application.
3. Add your local and hosted origins to the OAuth client.
4. Create a Google Sheet and copy the spreadsheet ID from its URL.
5. Make sure the Google account used by the admin has edit access to that sheet.

The app exports the currently filtered Results Dashboard rows into separate tabs
grouped by school and class. Each export clears and rewrites the matching tabs,
which keeps the sheet idempotent for the same filter set.

## Bulk Question Import

The project includes a CSV importer for adding multiple-choice questions to an
existing exam. The CSV file should include these headers:

```csv
questionText,optionA,optionB,optionC,optionD,correctAnswer
```

Place the CSV at `questions.csv`, keep your Firebase service account key at
`service-account.json`, then pass the target exam ID when running the importer:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID
```

Validate the CSV and target exam without importing:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --dry-run
```

Optional arguments:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --csv ./path/to/questions.csv --service-account ./path/to/service-account.json
```

The importer rejects invalid rows, duplicate question text within the CSV, and
exam IDs that do not exist. Do not commit `service-account.json`; it is
intentionally ignored by git.

## Result Sheet Export

The Results Dashboard includes per-result export actions:

- `PDF` opens a print-ready result sheet. Use the browser print dialog to save it
  as PDF.
- `DOC` downloads a Word-compatible `.doc` file generated in the browser.
- `Full PDF` groups the student's results for the same school, class, session,
  and term into one complete term result sheet.
- `Full DOC` downloads the same complete term result sheet as a Word-compatible
  `.doc` file.

This free-plan implementation does not require Cloud Functions or paid storage.
It can generate one basic assessment result sheet per saved result and one
standardized term result sheet across all matching subject results. If a student
has multiple attempts for the same subject in the same term, the latest attempt
is used in the full term result.

## Firebase Collections

```text
/admins/{uid}
  - optional metadata for admin access control

/schools/{schoolId}
  - name, address, isActive, createdAt

/classes/{classId}
  - schoolId, name, isActive, createdAt

/students/{studentId}
  - schoolId, schoolName, classId, className, fullName,
    admissionNumber, isActive, createdAt

/exams/{examId}
  - title, subject, academicSession, term, duration, pin, passmark,
    isActive, createdAt

/exams/{examId}/questions/{questionId}
  - questionText, options, correctAnswer, createdAt

/results/{resultId}
  - studentName, studentId, admissionNumber, class, classId, school,
    schoolId, subject, examId, score, total, percentage, timeTaken,
    passed, academicSession, term, submittedAt, answers

/examSessions/{sessionId}
  - server-created exam attempt with the full answer key for secure grading
    when `VITE_EXAM_SECURITY_MODE=functions`
```

## Deploy

Deploy Hosting and Firestore config for the free MVP.

```bash
npm run build
npm run firebase:deploy
```

Deploy Functions separately only when using the secure server-side mode:

```bash
npm run firebase:deploy:functions
```

## Free MVP Production Path

For the free MVP, keep the product focused on controlled pilots and low-risk
internal assessments:

1. Use `VITE_EXAM_SECURITY_MODE=client`.
2. Deploy Hosting and Firestore rules with `npm run firebase:deploy`.
3. Create one Firebase Auth admin user and an `/admins/{uid}` allowlist doc.
4. Add schools, classes, students, exams, and questions through the admin UI.
5. Run a full student exam flow before sharing the app link.
6. Review results and exports from the admin dashboard.

Before using ResultPilot for high-stakes exams, upgrade the grading flow to
Cloud Functions mode and disable direct client result writes in Firestore rules.

## Phase Verification Standard

Every implementation phase should pass these checks before it is treated as done:

```bash
npm run build
npm test
node --check functions/index.js
npm audit --omit=dev --audit-level=high
```

When validating Firestore rules locally, Firebase Tools requires JDK 21 or newer:

```bash
npx firebase-tools emulators:exec --only firestore "node"
```

Security review for every phase should also check Firestore rules, public reads,
student-write permissions, exposed answer keys, and any dependency audit findings.

## Security Note

The free MVP mode uses Firestore and Hosting only. Firestore rules validate the
shape and bounds of student result writes, but without a server-side grading layer,
they cannot prove that a submitted score was honestly calculated. For high-stakes
exams, use the optional Cloud Functions mode before production use.
