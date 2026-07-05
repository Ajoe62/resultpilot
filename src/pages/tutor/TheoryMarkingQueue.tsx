import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTheorySubmissions } from "../../hooks/useTheorySubmissions";
import { timeAgo, toMillis } from "../../hooks/util";
import TheoryMarkingPanel from "../../components/tutor/TheoryMarkingPanel";
import type { TheorySubmission } from "../../types/theory";

const STATUS_LABEL: Record<string, string> = {
  pending_ai: "AI marking in progress",
  ai_marking: "AI marking in progress",
  ai_marked: "AI marked — ready for review",
  ai_error: "AI error — manual review required",
  in_review: "In review",
};

// Queue of theory submissions awaiting review (used by tutor and admin — the
// hook scopes by role). Clicking a row opens the full marking panel.
export default function TheoryMarkingQueue() {
  const { submissions, pending, loading, error } = useTheorySubmissions();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<TheorySubmission | null>(null);
  const wantId = searchParams.get("submission");

  // Deep-link from a notification: auto-open the target submission once loaded.
  useEffect(() => {
    if (wantId && !selected) {
      const found = submissions.find((s) => s.id === wantId);
      if (found) setSelected(found);
    }
  }, [wantId, submissions, selected]);

  if (selected) {
    return (
      <TheoryMarkingPanel
        submission={selected}
        onClose={() => setSelected(null)}
        onFinalised={() => setSelected(null)}
      />
    );
  }

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Theory Marking</h2>
        <p>Written-answer submissions awaiting review.</p>
      </div>

      {error ? <p className="form-error">{error.message}</p> : null}

      <div className="card list-card">
        <div className="section-heading">
          <h3>Pending Review</h3>
          <p>{loading ? "Loading…" : `${pending.length} submission(s)`}</p>
        </div>
        <div className="stack-list">
          {pending.map((submission) => (
            <article
              className="stack-list__item"
              key={submission.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelected(submission)}
            >
              <div>
                <strong>
                  {submission.studentName}
                  {submission.priority ? " · ⚠ priority" : ""}
                </strong>
                <p className="muted-text">
                  {submission.examTitle} · {(submission.answers || []).length} answer(s)
                </p>
                <small>
                  {STATUS_LABEL[submission.status] || submission.status} ·{" "}
                  {timeAgo(toMillis(submission.submittedAt) || submission.submittedAtMs || 0)}
                </small>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(submission);
                }}
              >
                Review
              </button>
            </article>
          ))}
          {!loading && pending.length === 0 ? <p className="muted-text">Nothing awaiting review.</p> : null}
        </div>
      </div>
    </section>
  );
}
