import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import ExamForm from "../../components/exams/ExamForm";
import type { ExamFormValues } from "../../components/exams/ExamForm";
import QuestionEditor from "../../components/exams/QuestionEditor";
import TheoryQuestionBuilder from "../../components/exams/TheoryQuestionBuilder";
import { getAssessmentMaxScore } from "../../lib/assessmentTypes";
import type { Exam } from "../../hooks/types";

const key = (v: string) => v.trim().toLowerCase();

export default function TutorExamDetail() {
  const { examId } = useParams();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!examId) return;
      try {
        const snap = await getDoc(doc(db, "exams", examId));
        if (!active) return;
        setExam(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as Exam) : null);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [examId]);

  const handleSave = async (values: ExamFormValues) => {
    if (!examId) return;
    setError("");
    setStatus("");
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "exams", examId), {
        title: values.title.trim(),
        subject: values.subject.trim(),
        subjectKey: key(values.subject),
        academicSession: values.academicSession.trim(),
        term: values.term.trim(),
        duration: Number(values.duration),
        pin: values.pin.trim(),
        pinKey: key(values.pin),
        passmark: Number(values.passmark),
        assessmentType: values.assessmentType,
        assessmentMaxScore: getAssessmentMaxScore(values.assessmentType),
        isActive: values.isActive,
        updatedAt: serverTimestamp(),
      });
      setStatus("Exam saved. Existing submitted results were left unchanged.");
    } catch (e) {
      setError((e as Error).message || "Unable to save exam.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <section className="admin-section"><p className="muted-text">Loading exam…</p></section>;
  if (!exam) {
    return (
      <section className="admin-section">
        <p className="form-error">Exam not found or you don't have access to it.</p>
        <Link className="secondary-button" to="/tutor/exams">Back to exams</Link>
      </section>
    );
  }

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Manage Exam</h2>
        <p>Edit details and add questions. <Link to="/tutor/exams">Back to exams</Link></p>
      </div>

      <div className="admin-grid">
        <ExamForm
          initial={{
            title: exam.title,
            subject: exam.subject,
            academicSession: exam.academicSession,
            term: exam.term,
            duration: Number(exam.duration ?? 30),
            pin: exam.pin,
            passmark: Number(exam.passmark ?? 50),
            assessmentType: exam.assessmentType,
            isActive: exam.isActive !== false,
          }}
          submitting={submitting}
          submitLabel="Save Changes"
          error={error}
          status={status}
          onSubmit={handleSave}
        />
      </div>

      <div className="section-heading">
        <h3>Questions</h3>
      </div>
      <QuestionEditor examId={exam.id} />
      <TheoryQuestionBuilder examId={exam.id} exam={exam} />
    </section>
  );
}
