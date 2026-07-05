import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CircularScore from "../components/CircularScore";
import { useExamSession } from "../context/ExamSessionContext";
import {
  formatDateValue,
  formatTimeTaken,
  getScoreMessage,
} from "../lib/utils";

export default function ResultsPage() {
  const navigate = useNavigate();
  const { session, clearSession } = useExamSession();
  const [showReview, setShowReview] = useState(false);
  const result = session.submittedResult;
  const pendingTheory = Boolean(result?.hasTheory && result?.completionStatus === "pending_theory");
  const hasMCQ = result?.hasMCQ !== false;

  const restart = () => {
    clearSession();
    navigate("/", { replace: true });
  };

  return (
    <div className="page-shell">
      <section className="results-layout">
        <div className="card results-card">
          <span className="eyebrow">Exam Completed</span>
          <h1>{pendingTheory ? "Answers Submitted" : result.passed ? "Pass" : "Result Ready"}</h1>
          {hasMCQ ? <p>{getScoreMessage(result.percentage)}</p> : null}

          {pendingTheory ? (
            <div className="card" style={{ borderLeft: "4px solid #2563eb", margin: "0 0 1rem" }}>
              <strong>Your written answers have been received.</strong> Your teacher will review them and release your final result.
              {hasMCQ ? " The score below is your objective (Section A) result only." : ""}
            </div>
          ) : null}

          {hasMCQ ? (
            <>
              <CircularScore percentage={result.percentage} />

              <div className="results-grid">
                <div className="result-metric">
                  <span>{pendingTheory ? "Section A Score" : "Score"}</span>
                  <strong>
                    {result.score}/{result.total}
                  </strong>
                </div>
                <div className="result-metric">
                  <span>Status</span>
                  <strong className={result.passed ? "status-pill status-pill--pass" : "status-pill status-pill--fail"}>
                    {pendingTheory ? "Pending" : result.passed ? "Pass" : "Fail"}
                  </strong>
                </div>
                <div className="result-metric">
                  <span>Time Taken</span>
                  <strong>{formatTimeTaken(result.timeTaken)}</strong>
                </div>
                <div className="result-metric">
                  <span>Finished</span>
                  <strong>{formatDateValue(result.submittedAtMs)}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="results-grid">
              <div className="result-metric">
                <span>Written Answers</span>
                <strong>Under review</strong>
              </div>
              <div className="result-metric">
                <span>Finished</span>
                <strong>{formatDateValue(result.submittedAtMs)}</strong>
              </div>
            </div>
          )}

          <div className="button-row">
            {result.reviewItems?.length ? (
              <button
                className="secondary-button"
                onClick={() => setShowReview((current) => !current)}
                type="button"
              >
                {showReview ? "Hide Review" : "Review Answers"}
              </button>
            ) : null}
            <button className="primary-button" onClick={restart} type="button">
              Back to Home
            </button>
          </div>
        </div>

        {showReview ? (
          <div className="card review-card">
            <div className="section-heading">
              <h2>Answer Review</h2>
              <p>Read-only summary of your submitted answers.</p>
            </div>
            <div className="review-list">
              {result.reviewItems.map((item, index) => (
                <article className="review-item" key={item.questionId}>
                  <div className="review-item__header">
                    <strong>Question {index + 1}</strong>
                    <span className={item.isCorrect ? "status-pill status-pill--pass" : "status-pill status-pill--fail"}>
                      {item.isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  <p>{item.questionText}</p>
                  <p>
                    <strong>Your answer:</strong> {item.selected ?? "No answer"}
                  </p>
                  <p>
                    <strong>Correct answer:</strong> {item.correct}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
