// Security-rules tests for firestore.rules — run entirely against the local
// Firestore emulator (zero Firebase cost). They lock the intended access
// posture for ResultPilot's client-mode (low-stakes) configuration and guard
// against accidental regressions.
//
// Run with: npm run test:rules   (starts/stops the emulator automatically)

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const PROJECT_ID = "resultpilot-rules-test";
const ADMIN_UID = "admin-uid";
const USER_UID = "non-admin-uid";
const TUTOR_UID = "tutor-uid";
const OTHER_TUTOR_UID = "other-tutor-uid";
const SCHOOL = "school-active";

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed reference data with rules disabled so each test starts from a known state.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "admins", ADMIN_UID), { role: "admin" });
    await setDoc(doc(db, "schools", "school-active"), { name: "Active School", isActive: true });
    await setDoc(doc(db, "schools", "school-inactive"), { name: "Old School", isActive: false });
    await setDoc(doc(db, "classes", "class-active"), { name: "JSS2", schoolId: "school-active", isActive: true });
    await setDoc(doc(db, "students", "student-active"), { fullName: "Ada Lovelace", admissionNumber: "ADM-1", classId: "class-active", isActive: true });
    await setDoc(doc(db, "exams", "exam-active"), { title: "Math", subject: "Math", pin: "1234", isActive: true });
    await setDoc(doc(db, "exams", "exam-inactive"), { title: "Old", subject: "Old", pin: "9999", isActive: false });
    await setDoc(doc(db, "exams", "exam-active", "questions", "q1"), { questionText: "1+1?", options: ["1", "2", "3", "4"], correctAnswer: "B" });
    await setDoc(doc(db, "exams", "exam-inactive", "questions", "q1"), { questionText: "x?", options: ["1", "2", "3", "4"], correctAnswer: "A" });
    await setDoc(doc(db, "results", "result-1"), { studentName: "Ada", score: 1, total: 2 });
    await setDoc(doc(db, "manualScores", "ms-1"), { studentName: "Ada", score: 10 });
    await setDoc(doc(db, "termNotes", "tn-1"), { note: "good" });
    await setDoc(doc(db, "adminAuditLogs", "log-1"), { action: "x" });
    await setDoc(doc(db, "examSessions", "sess-1"), { status: "in_progress" });

    // ---- multi-tenant / claims fixtures ----
    await setDoc(doc(db, "exams", "exam-tutor"), { title: "Bio", subject: "Bio", pin: "111", isActive: false, schoolId: SCHOOL, tutorId: TUTOR_UID });
    await setDoc(doc(db, "exams", "exam-other"), { title: "Chem", subject: "Chem", pin: "222", isActive: false, schoolId: SCHOOL, tutorId: OTHER_TUTOR_UID });
    await setDoc(doc(db, "results", "res-tutor"), { schoolId: SCHOOL, tutorId: TUTOR_UID, studentName: "A", score: 1, total: 2 });
    await setDoc(doc(db, "results", "res-other"), { schoolId: SCHOOL, tutorId: OTHER_TUTOR_UID, studentName: "B", score: 1, total: 2 });
    await setDoc(doc(db, "schools", SCHOOL, "tutors", TUTOR_UID), { uid: TUTOR_UID, schoolId: SCHOOL, assignedClasses: ["class-active"], active: true, email: "t@x.com" });
    await setDoc(doc(db, "schools", SCHOOL, "tutors", OTHER_TUTOR_UID), { uid: OTHER_TUTOR_UID, schoolId: SCHOOL, assignedClasses: ["class-zzz"], active: true });
    await setDoc(doc(db, "schools", SCHOOL, "tutorInvites", "inv-1"), { token: "tok-1", accepted: false, schoolId: SCHOOL, email: "new@x.com", assignedClasses: ["class-active"] });
    await setDoc(doc(db, "students", "stud-in"), { fullName: "In Class", classId: "class-active", schoolId: SCHOOL, isActive: false });
    await setDoc(doc(db, "students", "stud-out"), { fullName: "Out Class", classId: "class-zzz", schoolId: SCHOOL, isActive: false });
    await setDoc(doc(db, "flags", "flag-1"), { schoolId: SCHOOL, raisedBy: TUTOR_UID, note: "needs review" });
  });
});

function unauth() {
  return testEnv.unauthenticatedContext().firestore();
}
function asAdmin() {
  return testEnv.authenticatedContext(ADMIN_UID).firestore();
}
function asUser() {
  return testEnv.authenticatedContext(USER_UID).firestore();
}
// Claims-based contexts: the second arg becomes request.auth.token.*
function asSchoolAdmin(schoolId = SCHOOL) {
  return testEnv
    .authenticatedContext("sa-uid", { role: "schooladmin", schoolId, active: true })
    .firestore();
}
function asOtherSchoolAdmin() {
  return testEnv
    .authenticatedContext("sa-B", { role: "schooladmin", schoolId: "school-B", active: true })
    .firestore();
}
function asTutor(uid = TUTOR_UID, schoolId = SCHOOL) {
  return testEnv
    .authenticatedContext(uid, { role: "tutor", schoolId, active: true })
    .firestore();
}
function asDeactivatedTutor(uid = TUTOR_UID, schoolId = SCHOOL) {
  return testEnv
    .authenticatedContext(uid, { role: "tutor", schoolId, active: false })
    .firestore();
}

function validResultPayload(overrides = {}) {
  return {
    studentName: "Ada Lovelace",
    studentId: "student-active",
    admissionNumber: "ADM-1",
    class: "JSS2",
    classId: "class-active",
    school: "Active School",
    schoolId: "school-active",
    subject: "Math",
    academicSession: "2025/2026",
    term: "First Term",
    examId: "exam-active",
    examTitle: "Math",
    assessmentType: "exam",
    assessmentMaxScore: 60,
    score: 1,
    total: 2,
    percentage: 50,
    timeTaken: 120,
    passed: false,
    answers: ["A", "B"],
    submittedAt: serverTimestamp(),
    submittedAtMs: 1700000000000,
    ...overrides,
  };
}

describe("admins collection", () => {
  test("signed-in user can read their OWN admin doc (used for the isAdmin check)", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "admins", ADMIN_UID)));
    await assertSucceeds(getDoc(doc(asUser(), "admins", USER_UID)));
  });
  test("user cannot read someone else's admin doc", async () => {
    await assertFails(getDoc(doc(asUser(), "admins", ADMIN_UID)));
  });
  test("unauthenticated cannot read admin docs", async () => {
    await assertFails(getDoc(doc(unauth(), "admins", ADMIN_UID)));
  });
  test("nobody can write admin docs (even an admin) — admins are provisioned out-of-band", async () => {
    await assertFails(setDoc(doc(asAdmin(), "admins", "new-admin"), { role: "admin" }));
  });
});

describe("schools / classes (public read of ACTIVE only, admin-only writes)", () => {
  test("unauth can read an active school", async () => {
    await assertSucceeds(getDoc(doc(unauth(), "schools", "school-active")));
  });
  test("unauth CANNOT read an inactive school", async () => {
    await assertFails(getDoc(doc(unauth(), "schools", "school-inactive")));
  });
  test("admin can read an inactive school", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "schools", "school-inactive")));
  });
  test("unauth cannot create/update/delete schools", async () => {
    await assertFails(setDoc(doc(unauth(), "schools", "x"), { name: "x", isActive: true }));
    await assertFails(updateDoc(doc(unauth(), "schools", "school-active"), { name: "hacked" }));
    await assertFails(deleteDoc(doc(unauth(), "schools", "school-active")));
  });
  test("admin can create a school", async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), "schools", "new"), { name: "New", isActive: true }));
  });
  test("unauth can read active class but not write", async () => {
    await assertSucceeds(getDoc(doc(unauth(), "classes", "class-active")));
    await assertFails(setDoc(doc(unauth(), "classes", "x"), { name: "x", isActive: true }));
  });
});

describe("exams (public read of ACTIVE only, admin-only writes)", () => {
  test("unauth can read an active exam", async () => {
    // KNOWN low-stakes acceptance: the exam `pin` is readable by anyone while
    // the exam is active (client-mode PIN matching needs it). Documented risk.
    await assertSucceeds(getDoc(doc(unauth(), "exams", "exam-active")));
  });
  test("unauth CANNOT read an inactive exam", async () => {
    await assertFails(getDoc(doc(unauth(), "exams", "exam-inactive")));
  });
  test("unauth cannot create/update/delete exams", async () => {
    await assertFails(setDoc(doc(unauth(), "exams", "x"), { title: "x", isActive: true }));
    await assertFails(updateDoc(doc(unauth(), "exams", "exam-active"), { pin: "0000" }));
    await assertFails(deleteDoc(doc(unauth(), "exams", "exam-active")));
  });
});

describe("questions subcollection", () => {
  test("unauth can read questions of an ACTIVE exam", async () => {
    // KNOWN low-stakes acceptance: `correctAnswer` is readable by anyone while
    // the parent exam is active (client-mode self-grading needs it). This is the
    // core integrity limitation of the free-plan / client-mode setup.
    await assertSucceeds(getDoc(doc(unauth(), "exams", "exam-active", "questions", "q1")));
  });
  test("unauth CANNOT read questions of an INACTIVE exam", async () => {
    await assertFails(getDoc(doc(unauth(), "exams", "exam-inactive", "questions", "q1")));
  });
  test("unauth cannot write questions", async () => {
    await assertFails(setDoc(doc(unauth(), "exams", "exam-active", "questions", "q2"), { questionText: "x", options: ["1", "2", "3", "4"], correctAnswer: "A" }));
  });
});

describe("results (anonymous create with validation, admin-only read/update/delete)", () => {
  test("unauth can create a VALID result", async () => {
    await assertSucceeds(addDoc(collection(unauth(), "results"), validResultPayload()));
  });
  test("rejects result where score > total", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ score: 5, total: 2 })));
  });
  test("rejects result where percentage is out of range", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ percentage: 150 })));
  });
  test("rejects result with an unexpected extra field", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ injected: "evil" })));
  });
  test("rejects result where answers length != total", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ answers: ["A"], total: 2 })));
  });
  test("rejects result with an invalid assessmentType", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ assessmentType: "midterm" })));
  });
  test("rejects result with a non-int score", async () => {
    await assertFails(addDoc(collection(unauth(), "results"), validResultPayload({ score: 1.5 })));
  });
  test("unauth CANNOT read results", async () => {
    await assertFails(getDoc(doc(unauth(), "results", "result-1")));
  });
  test("signed-in NON-admin cannot read results", async () => {
    await assertFails(getDoc(doc(asUser(), "results", "result-1")));
  });
  test("admin CAN read results", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "results", "result-1")));
  });
  test("unauth cannot update or delete results", async () => {
    await assertFails(updateDoc(doc(unauth(), "results", "result-1"), { score: 99 }));
    await assertFails(deleteDoc(doc(unauth(), "results", "result-1")));
  });
});

describe("admin-only collections are not exposed to clients", () => {
  test("examSessions: client cannot read/create, admin can read", async () => {
    await assertFails(getDoc(doc(unauth(), "examSessions", "sess-1")));
    await assertFails(setDoc(doc(unauth(), "examSessions", "x"), { status: "in_progress" }));
    await assertSucceeds(getDoc(doc(asAdmin(), "examSessions", "sess-1")));
  });
  test("manualScores: admin-only", async () => {
    await assertFails(getDoc(doc(unauth(), "manualScores", "ms-1")));
    await assertSucceeds(getDoc(doc(asAdmin(), "manualScores", "ms-1")));
  });
  test("termNotes: admin-only", async () => {
    await assertFails(getDoc(doc(unauth(), "termNotes", "tn-1")));
    await assertSucceeds(getDoc(doc(asAdmin(), "termNotes", "tn-1")));
  });
  test("adminAuditLogs: admin can read & create but NOT mutate (immutable audit trail)", async () => {
    await assertFails(getDoc(doc(unauth(), "adminAuditLogs", "log-1")));
    await assertSucceeds(getDoc(doc(asAdmin(), "adminAuditLogs", "log-1")));
    await assertSucceeds(setDoc(doc(asAdmin(), "adminAuditLogs", "log-2"), { action: "y" }));
    await assertFails(updateDoc(doc(asAdmin(), "adminAuditLogs", "log-1"), { action: "tampered" }));
    await assertFails(deleteDoc(doc(asAdmin(), "adminAuditLogs", "log-1")));
  });
});

describe("students (CURRENT posture — see report)", () => {
  test("KNOWN EXPOSURE: unauth can currently read an active student's PII", async () => {
    // This documents the present behavior. Recommended hardening (make students
    // admin-only) is coupled to the registration refactor — see review notes.
    await assertSucceeds(getDoc(doc(unauth(), "students", "student-active")));
  });
  test("unauth cannot write students", async () => {
    await assertFails(setDoc(doc(unauth(), "students", "x"), { fullName: "x", isActive: true }));
  });
});

describe("claims-based school admin (multi-tenant)", () => {
  test("school admin reads results in their school", async () => {
    await assertSucceeds(getDoc(doc(asSchoolAdmin(), "results", "res-tutor")));
  });
  test("school admin reads an inactive exam in their school", async () => {
    await assertSucceeds(getDoc(doc(asSchoolAdmin(), "exams", "exam-tutor")));
  });
  test("school admin creates an exam stamped with their own schoolId", async () => {
    await assertSucceeds(
      setDoc(doc(asSchoolAdmin(), "exams", "new-exam"), {
        title: "New", subject: "Math", pin: "555", isActive: true, schoolId: SCHOOL, tutorId: "legacy",
      }),
    );
  });
  test("school admin CANNOT create an exam under a different schoolId", async () => {
    await assertFails(
      setDoc(doc(asSchoolAdmin(), "exams", "cross"), {
        title: "X", subject: "Math", pin: "556", isActive: true, schoolId: "school-B", tutorId: "legacy",
      }),
    );
  });
  test("admin from another school CANNOT read this school's results", async () => {
    await assertFails(getDoc(doc(asOtherSchoolAdmin(), "results", "res-tutor")));
  });
  test("admin from another school CANNOT read this school's exam", async () => {
    await assertFails(getDoc(doc(asOtherSchoolAdmin(), "exams", "exam-tutor")));
  });
});

describe("create posture — legacy admin keeps working, tutor blocked", () => {
  test("legacy root admin can create a class/student/exam (no schoolId claim needed)", async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), "classes", "c-leg"), { name: "JSS3", schoolId: SCHOOL, isActive: true }));
    await assertSucceeds(setDoc(doc(asAdmin(), "students", "s-leg"), { fullName: "Leg", classId: "class-active", schoolId: SCHOOL, isActive: true }));
    await assertSucceeds(setDoc(doc(asAdmin(), "exams", "e-leg"), { title: "L", subject: "Math", pin: "909", isActive: true, schoolId: SCHOOL, tutorId: "legacy" }));
  });
  test("claims school admin can create in their own school", async () => {
    await assertSucceeds(setDoc(doc(asSchoolAdmin(), "classes", "c-sa"), { name: "JSS4", schoolId: SCHOOL, isActive: true }));
  });
  test("claims tutor CANNOT create a class or student", async () => {
    await assertFails(setDoc(doc(asTutor(), "classes", "c-t"), { name: "X", schoolId: SCHOOL, isActive: true }));
    await assertFails(setDoc(doc(asTutor(), "students", "s-t"), { fullName: "X", classId: "class-active", schoolId: SCHOOL, isActive: true }));
  });
});

describe("tutor scoping — exams & results", () => {
  test("tutor reads their OWN exam (even inactive)", async () => {
    await assertSucceeds(getDoc(doc(asTutor(), "exams", "exam-tutor")));
  });
  test("tutor CANNOT read another tutor's inactive exam", async () => {
    await assertFails(getDoc(doc(asTutor(), "exams", "exam-other")));
  });
  test("tutor reads their OWN result", async () => {
    await assertSucceeds(getDoc(doc(asTutor(), "results", "res-tutor")));
  });
  test("tutor CANNOT read another tutor's result", async () => {
    await assertFails(getDoc(doc(asTutor(), "results", "res-other")));
  });
  test("tutor creates an exam owned by themselves in their school", async () => {
    await assertSucceeds(
      setDoc(doc(asTutor(), "exams", "t-new"), {
        title: "T", subject: "Bio", pin: "777", isActive: true, schoolId: SCHOOL, tutorId: TUTOR_UID,
      }),
    );
  });
  test("tutor CANNOT create an exam owned by someone else", async () => {
    await assertFails(
      setDoc(doc(asTutor(), "exams", "t-bad"), {
        title: "T", subject: "Bio", pin: "778", isActive: true, schoolId: SCHOOL, tutorId: OTHER_TUTOR_UID,
      }),
    );
  });
  test("tutor CANNOT update another tutor's exam", async () => {
    await assertFails(updateDoc(doc(asTutor(), "exams", "exam-other"), { title: "hijacked" }));
  });
  test("DEACTIVATED tutor cannot read their own result", async () => {
    await assertFails(getDoc(doc(asDeactivatedTutor(), "results", "res-tutor")));
  });
});

describe("tutor scoping — students by assigned class", () => {
  test("tutor reads a student in an assigned class", async () => {
    await assertSucceeds(getDoc(doc(asTutor(), "students", "stud-in")));
  });
  test("tutor CANNOT read a student outside their assigned classes", async () => {
    await assertFails(getDoc(doc(asTutor(), "students", "stud-out")));
  });
  test("tutor cannot write students", async () => {
    await assertFails(setDoc(doc(asTutor(), "students", "x"), { fullName: "x", classId: "class-active", schoolId: SCHOOL }));
  });
});

describe("tutor roster + invites (only admin manages tutor docs)", () => {
  test("tutor reads their OWN tutor profile", async () => {
    await assertSucceeds(getDoc(doc(asTutor(), "schools", SCHOOL, "tutors", TUTOR_UID)));
  });
  test("tutor CANNOT read another tutor's profile", async () => {
    await assertFails(getDoc(doc(asTutor(), "schools", SCHOOL, "tutors", OTHER_TUTOR_UID)));
  });
  test("school admin reads any tutor profile", async () => {
    await assertSucceeds(getDoc(doc(asSchoolAdmin(), "schools", SCHOOL, "tutors", OTHER_TUTOR_UID)));
  });
  test("tutor CANNOT write their own profile (admin-only)", async () => {
    await assertFails(updateDoc(doc(asTutor(), "schools", SCHOOL, "tutors", TUTOR_UID), { assignedClasses: ["class-active", "class-zzz"] }));
  });
  test("school admin can update a tutor profile", async () => {
    await assertSucceeds(updateDoc(doc(asSchoolAdmin(), "schools", SCHOOL, "tutors", TUTOR_UID), { assignedClasses: [] }));
  });
  test("invite tokens are never client-readable; admin can read them", async () => {
    await assertFails(getDoc(doc(unauth(), "schools", SCHOOL, "tutorInvites", "inv-1")));
    await assertFails(getDoc(doc(asTutor(), "schools", SCHOOL, "tutorInvites", "inv-1")));
    await assertSucceeds(getDoc(doc(asSchoolAdmin(), "schools", SCHOOL, "tutorInvites", "inv-1")));
  });
});

describe("flags (tutor raises, admin reviews)", () => {
  test("tutor creates a flag they own in their school", async () => {
    await assertSucceeds(
      setDoc(doc(asTutor(), "flags", "flag-new"), { schoolId: SCHOOL, raisedBy: TUTOR_UID, note: "x" }),
    );
  });
  test("tutor CANNOT create a flag attributed to someone else", async () => {
    await assertFails(
      setDoc(doc(asTutor(), "flags", "flag-bad"), { schoolId: SCHOOL, raisedBy: OTHER_TUTOR_UID, note: "x" }),
    );
  });
  test("tutor reads their own flag; admin reads flags", async () => {
    await assertSucceeds(getDoc(doc(asTutor(), "flags", "flag-1")));
    await assertSucceeds(getDoc(doc(asSchoolAdmin(), "flags", "flag-1")));
  });
});

describe("results create requires an ACTIVE exam (Rule 6)", () => {
  test("rejects a result whose exam is inactive", async () => {
    await assertFails(
      addDoc(collection(unauth(), "results"), validResultPayload({ examId: "exam-inactive", examTitle: "Old" })),
    );
  });
  test("rejects a result whose exam does not exist", async () => {
    await assertFails(
      addDoc(collection(unauth(), "results"), validResultPayload({ examId: "no-such-exam" })),
    );
  });
});
