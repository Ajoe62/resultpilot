import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { useExamSession } from "../context/ExamSessionContext";
import { formatDuration } from "../lib/utils";

export default function ExamPage() {
  const navigate = useNavigate();
  const { session, selectAnswer, moveNext, submitSession } = useExamSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((session.endsAt - Date.now()) / 1000)),
  );

  const currentQuestion = session.questions[session.currentIndex];
  const selectedAnswer = session.answers[currentQuestion.id] ?? "";
  const isLastQuestion = session.currentIndex === session.questions.length - 1;
  const progress = Math.round(
    ((session.currentIndex + 1) / session.questions.length) * 100,
  );
  const timerDanger = remainingSeconds <= 5 * 60;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextSeconds = Math.max(
        0,
        Math.floor((session.endsAt - Date.now()) / 1000),
      );

      setRemainingSeconds(nextSeconds);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [session.endsAt]);

  useEffect(() => {
    if (remainingSeconds !== 0 || submitting) {
      return;
    }

    const autoSubmit = async () => {
      setSubmitting(true);
      try {
        await submitSession();
        navigate("/results", { replace: true });
      } catch (submissionError) {
        setError(submissionError.message || "Auto-submit failed.");
        setSubmitting(false);
      }
    };

    autoSubmit();
  }, [navigate, remainingSeconds, submitSession, submitting]);

  const answerLabels = ["A", "B", "C", "D"];

  const handleNext = async () => {
    if (!selectedAnswer) {
      setError("Select an option before moving on.");
      return;
    }

    setError("");

    if (!isLastQuestion) {
      moveNext();
      return;
    }

    setSubmitting(true);

    try {
      await submitSession();
      navigate("/results", { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || "Unable to submit exam.");
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="exam-layout">
        <section className="card exam-card">
          <header className="exam-card__header">
            <div>
              <span className="eyebrow">{session.exam.subject} Assessment</span>
              <h1>{session.exam.title}</h1>
              <p>
                Question {session.currentIndex + 1} of {session.questions.length}
              </p>
            </div>
            <div className={`timer-panel ${timerDanger ? "timer-panel--danger" : ""}`}>
              <span>Time Left</span>
              <strong>{formatDuration(remainingSeconds)}</strong>
            </div>
          </header>

          <ProgressBar value={progress} />

          <div className="question-block">
            <h2>{currentQuestion.questionText}</h2>
            <div className="answers-grid">
              {currentQuestion.options.map((option, index) => {
                const label = answerLabels[index];
                const isSelected = selectedAnswer === label;

                return (
                  <button
                    className={`answer-card ${isSelected ? "answer-card--selected" : ""}`}
                    key={`${currentQuestion.id}-${label}`}
                    onClick={() => selectAnswer(currentQuestion.id, label)}
                    type="button"
                  >
                    <span className="answer-card__label">{label}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="exam-actions">
            <div className="exam-helper">
              Backtracking is disabled for this session.
            </div>
            <button
              className="primary-button"
              disabled={submitting}
              onClick={handleNext}
              type="button"
            >
              {submitting
                ? "Submitting..."
                : isLastQuestion
                  ? "Submit Exam"
                  : "Next Question"}
            </button>
          </div>
        </section>

        <aside className="card exam-sidebar">
          <div className="stat-card">
            <span>Candidate</span>
            <strong>{session.student.fullName}</strong>
            <small>{session.student.schoolName}</small>
          </div>
          <div className="stat-card">
            <span>Answered</span>
            <strong>{Object.keys(session.answers).length}</strong>
            <small>Out of {session.questions.length}</small>
          </div>
          <div className="stat-card">
            <span>Pass Mark</span>
            <strong>{session.exam.passmark}%</strong>
            <small>Minimum score required</small>
          </div>
        </aside>
      </div>
    </div>
  );
}
