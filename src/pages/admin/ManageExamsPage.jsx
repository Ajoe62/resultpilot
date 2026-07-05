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
import { useAuth } from "../../context/AuthContext";
import ExamForm from "../../components/exams/ExamForm";
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

// Maps an exam doc to the ExamForm's field shape.
function toFormValues(exam, overrides = {}) {
  return {
    title: exam.title || "",
    subject: exam.subject || "",
    academicSession: exam.academicSession || getDefaultAcademicSession(),
    term: exam.term || TERMS[0],
    duration: Number(exam.duration || 30),
    pin: exam.pin || "",
    passmark: Number(exam.passmark || 50),
    assessmentType: exam.assessmentType || DEFAULT_ASSESSMENT_TYPE,
    isActive: exam.isActive !== false,
    ...overrides,
  };
}

export default function ManageExamsPage() {
  const { schoolId } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // editState.examId === "" means "create"; `initial` seeds the form (edit/copy).
  const [editState, setEditState] = useState({ examId: "", initial: undefined });
  const [formKey, setFormKey] = useState(0); // remounts ExamForm so it re-inits

  useEffect(() => {
    const examsQuery = query(collection(db, "exams"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      examsQuery,
      (snapshot) => {
        setExams(
          snapshot.docs
            .map((document) => ({ id: document.id, ...document.data() }))
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

  const setForm = (next) => {
    setEditState(next);
    setFormKey((k) => k + 1);
  };

  const resetExamForm = () => {
    setError("");
    setStatus("");
    setForm({ examId: "", initial: undefined });
  };

  const startEditingExam = (exam) => {
    setError("");
    setStatus("");
    setForm({ examId: exam.id, initial: toFormValues(exam) });
  };

  const duplicateExam = (exam) => {
    setError("");
    setStatus("");
    setForm({ examId: "", initial: toFormValues(exam, { title: `${exam.title || "Exam"} Copy`, pin: "", isActive: false }) });
  };

  const handleSaveExam = async (values) => {
    setError("");
    setStatus("");
    setSubmitting(true);

    try {
      if (values.isActive) {
        if (await hasActiveExamConflict({ subject: values.subject, pin: values.pin, excludeExamId: editState.examId })) {
          setError("An active exam already uses that subject and PIN. Deactivate it or change the PIN.");
          return;
        }
      }

      const examPayload = {
        title: values.title.trim(),
        subject: values.subject.trim(),
        subjectKey: normalizeLookupKey(values.subject),
        academicSession: values.academicSession.trim(),
        term: values.term.trim(),
        duration: Number(values.duration),
        pin: values.pin.trim(),
        pinKey: normalizeLookupKey(values.pin),
        passmark: Number(values.passmark),
        assessmentType: values.assessmentType,
        assessmentMaxScore: getAssessmentMaxScore(values.assessmentType),
        isActive: values.isActive,
      };

      // Stamp the tenant schoolId; tutorId "legacy" = school-owned. Only on create.
      const tenantFields = schoolId ? { schoolId } : {};

      if (editState.examId) {
        await updateDoc(doc(db, "exams", editState.examId), {
          ...examPayload,
          ...tenantFields,
          updatedAt: serverTimestamp(),
        });
        setStatus("Exam updated. Existing submitted results were left unchanged.");
      } else {
        await addDoc(collection(db, "exams"), {
          ...examPayload,
          ...tenantFields,
          tutorId: "legacy",
          isArchived: false,
          createdAt: serverTimestamp(),
        });
        setStatus("Exam created.");
      }

      setForm({ examId: "", initial: undefined });
    } catch (saveError) {
      setError(saveError.message || "Unable to save exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAssessmentType = async (exam, assessmentType) => {
    setError("");
    setStatus("");
    try {
      await updateDoc(doc(db, "exams", exam.id), {
        assessmentType,
        assessmentMaxScore: getAssessmentMaxScore(assessmentType),
        updatedAt: serverTimestamp(),
      });
      setStatus("Assessment type updated for future submissions only.");
    } catch (updateError) {
      setError(updateError.message || "Unable to update assessment type.");
    }
  };

  const toggleExamStatus = async (exam) => {
    setError("");
    setStatus("");
    try {
      if (!exam.isActive) {
        if (
          await hasActiveExamConflict({
            subject: exam.subjectKey || exam.subject,
            pin: exam.pinKey || exam.pin,
            excludeExamId: exam.id,
          })
        ) {
          setError("Another active exam already uses this subject and PIN. Resolve that conflict first.");
          return;
        }
      }

      await updateDoc(doc(db, "exams", exam.id), {
        isActive: !exam.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      setError(updateError.message || "Unable to update exam status.");
    }
  };

  const deleteExam = async (examId) => {
    setError("");
    setStatus("");
    try {
      await updateDoc(doc(db, "exams", examId), {
        isActive: false,
        isArchived: true,
        updatedAt: serverTimestamp(),
      });
      if (editState.examId === examId) {
        resetExamForm();
      }
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
        <div>
          <div className="section-heading">
            <h3>{editState.examId ? "Edit Exam" : "Create Exam"}</h3>
            <p>
              {editState.examId
                ? "Changes apply to future sessions. Existing submitted results stay unchanged."
                : "Create a new assessment session."}
            </p>
          </div>
          <ExamForm
            key={formKey}
            initial={editState.initial}
            submitting={submitting}
            submitLabel={editState.examId ? "Save Changes" : "Create Exam"}
            error={error}
            status={status}
            onSubmit={handleSaveExam}
          />
          {editState.examId ? (
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetExamForm}>
                Cancel Edit
              </button>
            </div>
          ) : null}
        </div>

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
                  <button className="secondary-button" onClick={() => startEditingExam(exam)} type="button">
                    Edit
                  </button>
                  <button className="secondary-button" onClick={() => duplicateExam(exam)} type="button">
                    Copy
                  </button>
                  <button className="secondary-button" onClick={() => toggleExamStatus(exam)} type="button">
                    {exam.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button className="danger-button" onClick={() => deleteExam(exam.id)} type="button">
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
