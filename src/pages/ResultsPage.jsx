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

  const restart = () => {
    clearSession();
    navigate("/", { replace: true });
  };

  return (
    <div className="page-shell">
      <section className="results-layout">
        <div className="card results-card">
          <span className="eyebrow">Exam Completed</span>
          <h1>{result.passed ? "Pass" : "Result Ready"}</h1>
          <p>{getScoreMessage(result.percentage)}</p>

          <CircularScore percentage={result.percentage} />

          <div className="results-grid">
            <div className="result-metric">
              <span>Score</span>
              <strong>
                {result.score}/{result.total}
              </strong>
            </div>
            <div className="result-metric">
              <span>Status</span>
              <strong className={result.passed ? "status-pill status-pill--pass" : "status-pill status-pill--fail"}>
                {result.passed ? "Pass" : "Fail"}
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

          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => setShowReview((current) => !current)}
              type="button"
            >
              {showReview ? "Hide Review" : "Review Answers"}
            </button>
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
