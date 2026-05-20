# ResultPilot MVP Launch Checklist

ResultPilot is currently positioned as an assessment management and examination
automation MVP for controlled school and tutor pilots.

## Phase 1 - Local Readiness

- Fill `.env` with Firebase web app config.
- Keep `VITE_EXAM_SECURITY_MODE=client` for the free MVP.
- Keep `.env` and `service-account.json` private.
- Run:

```bash
npm test
npm run build
node --check scripts/import-questions.mjs
node --check functions/index.js
```

## Phase 2 - Firebase Setup

- Create or confirm the Firebase project.
- Enable Firebase Authentication email/password sign-in.
- Create one admin user in Firebase Authentication.
- Create `/admins/{uid}` in Firestore for that admin.
- Create `.firebaserc` from `.firebaserc.example`.
- Deploy Firestore rules and Hosting:

```bash
npm run build
npm run firebase:deploy
```

## Phase 3 - Demo Data Setup

- Add at least one school.
- Add at least one class under that school.
- Add at least three students.
- Create one exam per demo subject.
- Add questions manually or import from CSV.
- Validate CSV imports before writing:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --dry-run
```

## Phase 4 - Full Flow Test

- Admin can sign in.
- Non-admin accounts cannot access admin pages.
- Student can select school, class, name, subject, and PIN.
- Wrong PIN is rejected.
- Inactive exams are not available.
- Exam timer counts down correctly.
- Student can submit answers.
- Result displays immediately.
- Result is saved in Firestore.
- Admin can see the result in the dashboard.
- CSV, PDF, DOC, full PDF, and full DOC exports work.
- Student lookup shows attempts for a selected student.

## Phase 5 - Pilot Boundaries

- Present this version as a free MVP for controlled pilots.
- Do not present client-side grading as high-stakes exam security.
- Tell pilot users that the secure grading upgrade will use Cloud Functions.
- Use real school feedback to prioritize analytics, CSV upload in the admin UI,
  and stronger reporting.

## Phase 6 - Content Launch

- Post 1: the manual assessment problem.
- Post 2: introducing ResultPilot.
- Post 3: admin exam setup.
- Post 4: student exam experience.
- Post 5: automatic grading and result recording.
- Post 6: result exports and performance tracking.
- Post 7: technical build with React and Firebase.
- Post 8: pilot invitation for schools, tutors, and training centers.
