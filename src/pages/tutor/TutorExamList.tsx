import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useExams } from "../../hooks/useExams";
import { useResults } from "../../hooks/useResults";
import { summariseByExam } from "../../lib/analytics";
import type { Exam } from "../../hooks/types";

export default function TutorExamList() {
  const { schoolId, currentUser } = useAuth();
  const { exams, loading } = useExams();
  const { results } = useResults();
  const [subject, setSubject] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [error, setError] = useState("");

  const statsByExam = useMemo(() => {
    const map = new Map<string, { count: number; average: number; passRate: number }>();
    for (const s of summariseByExam(results)) {
      map.set(s.examId, {
        count: s.count,
        average: s.average,
        passRate: s.count ? Math.round((s.passCount / s.count) * 100) : 0,
      });
    }
    return map;
  }, [results]);

  const subjects = useMemo(
    () => [...new Set(exams.map((e) => e.subject).filter(Boolean))] as string[],
    [exams],
  );

  const visible = exams.filter((e) => {
    if (subject && e.subject !== subject) return false;
    if (statusFilter === "active" && !e.isActive) return false;
    if (statusFilter === "inactive" && e.isActive) return false;
    return true;
  });

  const toggleActive = async (exam: Exam) => {
    setError("");
    try {
      await updateDoc(doc(db, "exams", exam.id), { isActive: !exam.isActive, updatedAt: serverTimestamp() });
    } catch (e) {
      setError((e as Error).message || "Unable to update exam.");
    }
  };

  const duplicate = async (exam: Exam) => {
    setError("");
    if (!schoolId || !currentUser) return;
    try {
      await addDoc(collection(db, "exams"), {
        title: `${exam.title || "Exam"} Copy`,
        subject: exam.subject || "",
        subjectKey: String(exam.subject || "").trim().toLowerCase(),
        academicSession: exam.academicSession || "",
        term: exam.term || "",
        duration: Number(exam.duration || 30),
        pin: "",
        pinKey: "",
        passmark: Number(exam.passmark || 50),
        assessmentType: exam.assessmentType || "exam",
        assessmentMaxScore: Number(exam.assessmentMaxScore || 60),
        isActive: false,
        isArchived: false,
        schoolId,
        tutorId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      setError((e as Error).message || "Unable to duplicate exam.");
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>My Exams</h2>
        <p>Exams you own. Create, activate, and manage questions.</p>
      </div>

      <div className="button-row">
        <Link className="primary-button" to="/tutor/exams/new">Create Exam</Link>
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="card list-card">
        <div className="section-heading">
          <h3>Exams</h3>
          <p>{loading ? "Loading…" : `${visible.length} exam(s)`}</p>
        </div>
        <div className="stack-list">
          {visible.map((exam) => {
            const stats = statsByExam.get(exam.id);
            return (
              <article className="stack-list__item" key={exam.id}>
                <div>
                  <strong>{exam.title}</strong>
                  <p className="muted-text">
                    {exam.subject} · {exam.term || "—"} · {exam.isActive ? "Active" : "Inactive"}
                  </p>
                  <small>
                    {stats ? `${stats.count} submissions · avg ${stats.average}% · pass ${stats.passRate}%` : "No submissions yet"}
                  </small>
                </div>
                <div className="button-row">
                  <Link className="secondary-button" to={`/tutor/exams/${exam.id}`}>Manage</Link>
                  <button className="secondary-button" type="button" onClick={() => toggleActive(exam)}>
                    {exam.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => duplicate(exam)}>Duplicate</button>
                </div>
              </article>
            );
          })}
          {!loading && visible.length === 0 ? <p className="muted-text">No exams yet. Create one to get started.</p> : null}
        </div>
      </div>
    </section>
  );
}
