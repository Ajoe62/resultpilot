import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useExams } from "../../hooks/useExams";
import { useResults } from "../../hooks/useResults";
import { useStudents } from "../../hooks/useStudents";
import { timeAgo } from "../../hooks/util";
import { passRate } from "../../lib/analytics";

// Tutor landing: summary cards, a recent-results feed, quick actions, and an
// alert for assigned-class students who haven't sat a currently-active exam.
export default function TutorOverview() {
  const { exams, loading: examsLoading } = useExams();
  const { results, loading: resultsLoading } = useResults();
  const { students } = useStudents();

  const activeExams = exams.filter((e) => e.isActive);
  const examsWithSubmissions = new Set(results.map((r) => r.examId)).size;

  const recent = results.slice(0, 10);

  // Students (in assigned classes) with no result for any active exam.
  const notTakenCount = useMemo(() => {
    if (activeExams.length === 0 || students.length === 0) return 0;
    const taken = new Set(results.map((r) => `${r.examId}:${r.studentId || r.studentName}`));
    let count = 0;
    for (const student of students) {
      const sitAny = activeExams.some((exam) =>
        taken.has(`${exam.id}:${student.id}`) || taken.has(`${exam.id}:${student.fullName}`),
      );
      if (!sitAny) count += 1;
    }
    return count;
  }, [activeExams, students, results]);

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Overview</h2>
        <p>Your classes, exams and recent activity at a glance.</p>
      </div>

      {notTakenCount > 0 ? (
        <div className="card" style={{ borderLeft: "4px solid #d97706" }}>
          <strong>{notTakenCount} student(s)</strong> in your classes haven't taken a currently active exam.
        </div>
      ) : null}

      <div className="admin-grid">
        <div className="card"><h3>Total Students</h3><p className="muted-text">{students.length}</p></div>
        <div className="card"><h3>Active Exams</h3><p className="muted-text">{examsLoading ? "…" : activeExams.length}</p></div>
        <div className="card"><h3>Exams With Submissions</h3><p className="muted-text">{examsWithSubmissions}</p></div>
        <div className="card"><h3>Average Pass Rate</h3><p className="muted-text">{resultsLoading ? "…" : `${passRate(results)}%`}</p></div>
      </div>

      <div className="button-row">
        <Link className="primary-button" to="/tutor/exams/new">Create Exam</Link>
        <Link className="secondary-button" to="/tutor/results">View Results</Link>
        <Link className="secondary-button" to="/tutor/students">View Students</Link>
      </div>

      <div className="card list-card">
        <div className="section-heading">
          <h3>Recent Results</h3>
          <p>{resultsLoading ? "Loading…" : `Last ${recent.length} submission(s)`}</p>
        </div>
        <div className="stack-list">
          {recent.map((r) => (
            <article className="stack-list__item" key={r.id}>
              <div>
                <strong>{r.studentName}</strong>
                <p className="muted-text">{r.examTitle} — {r.percentage ?? 0}% · {r.passed ? "Passed" : "Failed"}</p>
              </div>
              <small>{timeAgo(r.submittedAtMs ?? 0)}</small>
            </article>
          ))}
          {!resultsLoading && recent.length === 0 ? <p className="muted-text">No submissions yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
