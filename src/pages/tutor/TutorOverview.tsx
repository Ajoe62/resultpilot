import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useExams } from "../../hooks/useExams";
import { useResults } from "../../hooks/useResults";

// Minimal tutor landing so the invite -> sign-in -> dashboard flow works
// end-to-end. Phase 7 replaces this with the full dashboard (summary cards,
// recent results feed, analytics).
export default function TutorOverview() {
  const navigate = useNavigate();
  const { currentUser, assignedClasses, logout } = useAuth();
  const { exams, loading: examsLoading } = useExams();
  const { results, loading: resultsLoading } = useResults();

  const activeExams = exams.filter((exam) => exam.isActive).length;

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="page-shell">
      <section className="admin-section">
        <div className="section-heading">
          <h2>Tutor Dashboard</h2>
          <p>Signed in as {currentUser?.email}</p>
        </div>

        <div className="admin-grid">
          <div className="card">
            <h3>My Exams</h3>
            <p className="muted-text">
              {examsLoading ? "Loading..." : `${exams.length} total · ${activeExams} active`}
            </p>
          </div>
          <div className="card">
            <h3>Submissions</h3>
            <p className="muted-text">
              {resultsLoading ? "Loading..." : `${results.length} result(s)`}
            </p>
          </div>
          <div className="card">
            <h3>My Classes</h3>
            <p className="muted-text">{(assignedClasses ?? []).length} assigned</p>
          </div>
        </div>

        <div className="button-row">
          <button className="secondary-button" onClick={handleLogout} type="button">
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}
