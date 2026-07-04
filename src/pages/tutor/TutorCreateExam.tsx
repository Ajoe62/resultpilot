import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import ExamForm from "../../components/exams/ExamForm";
import type { ExamFormValues } from "../../components/exams/ExamForm";
import { getAssessmentMaxScore } from "../../lib/assessmentTypes";

const key = (v: string) => v.trim().toLowerCase();

async function activeConflict(subject: string, pin: string): Promise<boolean> {
  const snap = await getDocs(query(collection(db, "exams"), where("isActive", "==", true)));
  return snap.docs.some((d) => {
    const e = d.data();
    return key(e.subjectKey || e.subject || "") === key(subject) && key(e.pinKey || e.pin || "") === key(pin);
  });
}

export default function TutorCreateExam() {
  const navigate = useNavigate();
  const { schoolId, currentUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: ExamFormValues) => {
    setError("");
    if (!schoolId || !currentUser) {
      setError("Your account is missing a school. Contact your admin.");
      return;
    }
    setSubmitting(true);
    try {
      if (values.isActive && (await activeConflict(values.subject, values.pin))) {
        setError("An active exam already uses that subject and PIN. Change the PIN or leave it inactive.");
        return;
      }
      const ref = await addDoc(collection(db, "exams"), {
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
        isArchived: false,
        schoolId,
        tutorId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      navigate(`/tutor/exams/${ref.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message || "Unable to create exam.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Create Exam</h2>
        <p>Set the details, then add questions on the next screen.</p>
      </div>
      <ExamForm submitting={submitting} submitLabel="Create Exam" error={error} onSubmit={handleSubmit} />
    </section>
  );
}
