import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { cloudFunctions, db } from "../../lib/firebase";

const RESET_OPTIONS = [
  { value: "automated", label: "Automated exam result only" },
  { value: "manual", label: "Manual score only" },
  { value: "both", label: "Automated and manual scores" },
];

function buildTargetPayload(target) {
  return {
    resultId: target?.resultId || "",
    manualScoreId: target?.manualScoreId || "",
    studentId: target?.studentId || "",
    studentName: target?.studentName || "",
    academicSession: target?.academicSession || "",
    term: target?.term || "",
    subject: target?.subject || "",
    assessmentType: target?.assessmentType || "",
  };
}

function matchesTarget(data, target) {
  return ["academicSession", "term", "subject", "assessmentType"].every(
    (field) => !target[field] || String(data[field] || "") === target[field],
  );
}

function summarizeRecord(id, data) {
  return {
    id,
    studentName: data.studentName || "",
    studentId: data.studentId || "",
    subject: data.subject || "",
    academicSession: data.academicSession || "",
    term: data.term || "",
    assessmentType: data.assessmentType || "",
    score: Number(data.score || 0),
    total: Number(data.total || data.maxScore || data.assessmentMaxScore || 0),
    examId: data.examId || "",
    examTitle: data.examTitle || "",
  };
}

async function getMatchingRecords(collectionName, target) {
  if (collectionName === "results" && target.resultId) {
    const snapshot = await getDoc(doc(db, collectionName, target.resultId));
    return snapshot.exists() ? [snapshot] : [];
  }

  if (collectionName === "manualScores" && target.manualScoreId) {
    const snapshot = await getDoc(doc(db, collectionName, target.manualScoreId));
    return snapshot.exists() ? [snapshot] : [];
  }

  const studentField = target.studentId ? "studentId" : "studentName";
  const studentValue = target.studentId || target.studentName;
  const snapshot = await getDocs(
    query(collection(db, collectionName), where(studentField, "==", studentValue)),
  );

  return snapshot.docs.filter((record) => matchesTarget(record.data(), target));
}

async function resetWithFirestore({ mode, reason, target, adminUser }) {
  const shouldResetAutomated = mode === "automated" || mode === "both";
  const shouldResetManual = mode === "manual" || mode === "both";
  const automatedRecords = shouldResetAutomated
    ? await getMatchingRecords("results", target)
    : [];
  const manualRecords = shouldResetManual
    ? await getMatchingRecords("manualScores", target)
    : [];

  if (!automatedRecords.length && !manualRecords.length) {
    throw new Error("No matching result records were found.");
  }

  await Promise.all([
    ...automatedRecords.flatMap((record) => [
      deleteDoc(record.ref),
      deleteDoc(doc(db, "examSessions", record.id)),
    ]),
    ...manualRecords.map((record) => deleteDoc(record.ref)),
    setDoc(doc(collection(db, "adminAuditLogs")), {
      action: "result_reset",
      mode,
      reason,
      target,
      adminUid: adminUser.uid,
      adminEmail: adminUser.email || "",
      automatedResults: automatedRecords.map((record) =>
        summarizeRecord(record.id, record.data()),
      ),
      manualScores: manualRecords.map((record) =>
        summarizeRecord(record.id, record.data()),
      ),
      createdAt: serverTimestamp(),
      source: "client_fallback",
    }),
  ]);

  return {
    success: true,
    deletedAutomatedResults: automatedRecords.length,
    deletedManualScores: manualRecords.length,
  };
}

export default function ResultResetDialog({
  isOpen,
  target,
  defaultMode = "automated",
  onClose,
  onCompleted,
}) {
  const { currentUser } = useAuth();
  const [mode, setMode] = useState(defaultMode);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setReason("");
      setConfirmation("");
      setPassword("");
      setError("");
      setSubmitting(false);
    }
  }, [defaultMode, isOpen, target]);

  if (!isOpen || !target) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!currentUser?.email) {
      setError("Admin account email is required for password confirmation.");
      return;
    }

    if (confirmation.trim() !== "RESET") {
      setError("Type RESET to confirm this operation.");
      return;
    }

    if (reason.trim().length < 5) {
      setError("Provide a reset reason.");
      return;
    }

    if (!password) {
      setError("Enter your admin password.");
      return;
    }

    setSubmitting(true);

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);

      const payload = {
        mode,
        reason: reason.trim(),
        target: buildTargetPayload(target),
      };
      const resetStudentResult = httpsCallable(cloudFunctions, "resetStudentResult");
      let summary;

      try {
        const response = await resetStudentResult(payload);
        summary = response.data;
      } catch (functionError) {
        summary = await resetWithFirestore({
          ...payload,
          adminUser: currentUser,
        });
      }

      onCompleted?.(summary);
      onClose();
    } catch (resetError) {
      setError(resetError.message || "Unable to reset this result.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="card dialog-card" onSubmit={handleSubmit}>
        <div className="section-heading">
          <h3>Reset Student Result</h3>
          <p>
            {target.studentName || "Selected student"} - {target.subject || "Selected subject"} -{" "}
            {target.academicSession || "Session"} - {target.term || "Term"}
          </p>
        </div>

        {target.scoreLabel ? <p className="muted-text">{target.scoreLabel}</p> : null}

        <label className="field">
          <span>Reset Type</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {RESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Reason For Reset</span>
          <textarea
            rows="3"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Example: Student lost connection before submission review."
          />
        </label>

        <label className="field">
          <span>Type RESET</span>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="RESET"
          />
        </label>

        <label className="field">
          <span>Admin Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Confirm your password"
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="button-row">
          <button className="danger-button" disabled={submitting} type="submit">
            {submitting ? "Resetting..." : "Reset Result"}
          </button>
          <button
            className="secondary-button"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
