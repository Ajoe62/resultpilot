import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  ASSESSMENT_TYPES,
  DEFAULT_ASSESSMENT_TYPE,
  getAssessmentLabel,
  getAssessmentMaxScore,
} from "../../lib/assessmentTypes";
import { formatDateValue } from "../../lib/utils";

const TERMS = ["First Term", "Second Term", "Third Term"];

function getDefaultAcademicSession() {
  const currentYear = new Date().getFullYear();
  return `${currentYear}/${currentYear + 1}`;
}

function normalizeLookupKey(value) {
  return String(value || "").trim().toLowerCase();
}

const INITIAL_FORM = {
  title: "",
  subject: "",
  academicSession: getDefaultAcademicSession(),
  term: TERMS[0],
  duration: 30,
  pin: "",
  passmark: 50,
  assessmentType: DEFAULT_ASSESSMENT_TYPE,
  isActive: true,
};

function validateExamForm(form) {
  const title = form.title.trim();
  const subject = form.subject.trim();
  const pin = form.pin.trim();
  const academicSession = form.academicSession.trim();
  const term = form.term.trim();
  const duration = Number(form.duration);
  const passmark = Number(form.passmark);
  const assessmentType = form.assessmentType;

  if (!title) {
    return "Exam title is required.";
  }

  if (!subject) {
    return "Subject is required.";
  }

  if (!pin) {
    return "Access PIN is required.";
  }

  if (!academicSession) {
    return "Academic session is required.";
  }

  if (!term) {
    return "Term is required.";
  }

  if (!ASSESSMENT_TYPES.some((type) => type.value === assessmentType)) {
    return "Assessment type is required.";
  }

  if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
    return "Duration must be a whole number between 1 and 300 minutes.";
  }

  if (!Number.isFinite(passmark) || passmark < 0 || passmark > 100) {
    return "Pass mark must be between 0 and 100.";
  }

  return "";
}

async function hasActiveExamConflict({ subject, pin, excludeExamId = "" }) {
  const subjectKey = normalizeLookupKey(subject);
  const pinKey = normalizeLookupKey(pin);
  const conflictSnapshot = await getDocs(
    query(collection(db, "exams"), where("isActive", "==", true)),
  );

  return conflictSnapshot.docs.some((document) => {
    if (document.id === excludeExamId) {
      return false;
    }

    const exam = document.data();
    return (
      normalizeLookupKey(exam.subjectKey || exam.subject) === subjectKey &&
      normalizeLookupKey(exam.pinKey || exam.pin) === pinKey
    );
  });
}

export default function ManageExamsPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const examsQuery = query(collection(db, "exams"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      examsQuery,
      (snapshot) => {
        setExams(
          snapshot.docs
            .map((document) => ({
              id: document.id,
              ...document.data(),
            }))
            .filter((exam) => !exam.isArchived),
        );
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const handleCreateExam = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const validationError = validateExamForm(form);
      if (validationError) {
        setError(validationError);
        return;
      }

      if (form.isActive) {
        if (await hasActiveExamConflict(form)) {
          setError(
            "An active exam already uses that subject and PIN. Deactivate it or change the PIN.",
          );
          return;
        }
      }

      await addDoc(collection(db, "exams"), {
        title: form.title.trim(),
        subject: form.subject.trim(),
        subjectKey: normalizeLookupKey(form.subject),
        academicSession: form.academicSession.trim(),
        term: form.term.trim(),
        duration: Number(form.duration),
        pin: form.pin.trim(),
        pinKey: normalizeLookupKey(form.pin),
        passmark: Number(form.passmark),
        assessmentType: form.assessmentType,
        assessmentMaxScore: getAssessmentMaxScore(form.assessmentType),
        isActive: form.isActive,
        isArchived: false,
        createdAt: serverTimestamp(),
      });
      setForm(INITIAL_FORM);
    } catch (creationError) {
      setError(creationError.message || "Unable to create exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAssessmentType = async (exam, assessmentType) => {
    setError("");

    try {
      const assessmentMaxScore = getAssessmentMaxScore(assessmentType);

      await updateDoc(doc(db, "exams", exam.id), {
        assessmentType,
        assessmentMaxScore,
      });

      const resultsSnapshot = await getDocs(
        query(collection(db, "results"), where("examId", "==", exam.id)),
      );

      await Promise.all(
        resultsSnapshot.docs.map((resultDocument) =>
          updateDoc(doc(db, "results", resultDocument.id), {
            assessmentType,
            assessmentMaxScore,
          }),
        ),
      );
    } catch (updateError) {
      setError(updateError.message || "Unable to update assessment type.");
    }
  };

  const toggleExamStatus = async (exam) => {
    setError("");

    try {
      if (!exam.isActive) {
        if (
          await hasActiveExamConflict({
            subject: exam.subjectKey || exam.subject,
            pin: exam.pinKey || exam.pin,
            excludeExamId: exam.id,
          })
        ) {
          setError(
            "Another active exam already uses this subject and PIN. Resolve that conflict first.",
          );
          return;
        }
      }

      await updateDoc(doc(db, "exams", exam.id), {
        isActive: !exam.isActive,
      });
    } catch (updateError) {
      setError(updateError.message || "Unable to update exam status.");
    }
  };

  const deleteExam = async (examId) => {
    setError("");

    try {
      await updateDoc(doc(db, "exams", examId), {
        isActive: false,
        isArchived: true,
      });
    } catch (deleteError) {
      setError(deleteError.message || "Unable to archive exam.");
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Manage Exams</h2>
        <p>Create, activate, or retire assessment sessions.</p>
      </div>

      <div className="admin-grid">
        <form className="card form-card" onSubmit={handleCreateExam}>
          <label className="field">
            <span>Exam Title</span>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="JavaScript Midterm"
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Subject</span>
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subject: event.target.value }))
                }
                placeholder="HTML"
              />
            </label>

            <label className="field">
              <span>Academic Session</span>
              <input
                value={form.academicSession}
                onChange={(event) =>
                  setForm((current) => ({ ...current, academicSession: event.target.value }))
                }
                placeholder="2025/2026"
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Term</span>
              <select
                value={form.term}
                onChange={(event) =>
                  setForm((current) => ({ ...current, term: event.target.value }))
                }
              >
                {TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Duration (Minutes)</span>
              <input
                min="1"
                type="number"
                value={form.duration}
                onChange={(event) =>
                  setForm((current) => ({ ...current, duration: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Assessment Type</span>
            <select
              value={form.assessmentType}
              onChange={(event) =>
                setForm((current) => ({ ...current, assessmentType: event.target.value }))
              }
            >
              {ASSESSMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} ({type.maxScore} marks)
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Access PIN</span>
              <input
                value={form.pin}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pin: event.target.value }))
                }
                placeholder="JS2026"
              />
            </label>

            <label className="field">
              <span>Pass Mark (%)</span>
              <input
                max="100"
                min="0"
                type="number"
                value={form.passmark}
                onChange={(event) =>
                  setForm((current) => ({ ...current, passmark: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Activate exam immediately</span>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Saving..." : "Create Exam"}
          </button>
        </form>

        <div className="card list-card">
          <div className="section-heading">
            <h3>All Exams</h3>
            <p>{loading ? "Loading exams..." : `${exams.length} exams found`}</p>
          </div>
          <div className="stack-list">
            {exams.map((exam) => (
              <article className="stack-list__item" key={exam.id}>
                <div>
                  <strong>{exam.title}</strong>
                  <p>
                    {exam.subject} - {getAssessmentLabel(exam.assessmentType)} - {exam.academicSession || "No session"} - {exam.term || "No term"} - {exam.duration} mins - Pass {exam.passmark}%
                  </p>
                  <small>Created {formatDateValue(exam.createdAt)}</small>
                </div>
                <div className="button-row">
                  <select
                    aria-label={`Assessment type for ${exam.title}`}
                    value={exam.assessmentType || DEFAULT_ASSESSMENT_TYPE}
                    onChange={(event) => updateAssessmentType(exam, event.target.value)}
                  >
                    {ASSESSMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary-button"
                    onClick={() => toggleExamStatus(exam)}
                    type="button"
                  >
                    {exam.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => deleteExam(exam.id)}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
            {!loading && exams.length === 0 ? (
              <p className="muted-text">No exams created yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
