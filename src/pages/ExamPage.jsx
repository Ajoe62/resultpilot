import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import TheoryAnswerInput from "../components/exam/TheoryAnswerInput";
import { useExamSession } from "../context/ExamSessionContext";
import { formatDuration } from "../lib/utils";

const ANSWER_LABELS = ["A", "B", "C", "D"];

export default function ExamPage() {
  const navigate = useNavigate();
  const {
    session,
    selectAnswer,
    selectTheoryAnswer,
    setTheorySubAnswer,
    moveNext,
    movePrevious,
    submitSession,
  } = useExamSession();

  const questions = session.questions || [];
  const theoryQuestions = session.theoryQuestions || [];
  const hasMCQ = questions.length > 0;
  const hasTheory = theoryQuestions.length > 0;
  const theoryAnswers = session.theoryAnswers || {};
  const theorySection = session.theorySection || {};

  const [phase, setPhase] = useState(hasMCQ ? "mcq" : "theory");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((session.endsAt - Date.now()) / 1000)),
  );

  const timerDanger = remainingSeconds <= 5 * 60;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.floor((session.endsAt - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [session.endsAt]);

  const doSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await submitSession();
      navigate("/results", { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || "Unable to submit exam.");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (remainingSeconds !== 0 || submitting) return;
    doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, submitting]);

  const Timer = (
    <div className={`timer-panel ${timerDanger ? "timer-panel--danger" : ""}`}>
      <span>Time Left</span>
      <strong>{formatDuration(remainingSeconds)}</strong>
    </div>
  );

  const Sidebar = (
    <aside className="card exam-sidebar">
      <div className="stat-card">
        <span>Candidate</span>
        <strong>{session.student.fullName}</strong>
        <small>{session.student.schoolName}</small>
      </div>
      {hasMCQ ? (
        <div className="stat-card">
          <span>Objective Answered</span>
          <strong>{Object.keys(session.answers || {}).length}</strong>
          <small>Out of {questions.length}</small>
        </div>
      ) : null}
      <div className="stat-card">
        <span>Pass Mark</span>
        <strong>{session.exam.passmark}%</strong>
        <small>Minimum score required</small>
      </div>
    </aside>
  );

  // ---------------- MCQ phase ----------------
  if (phase === "mcq") {
    const currentQuestion = questions[session.currentIndex];
    const selectedAnswer = session.answers?.[currentQuestion.id] ?? "";
    const isFirstQuestion = session.currentIndex === 0;
    const isLastQuestion = session.currentIndex === questions.length - 1;
    const progress = Math.round(((session.currentIndex + 1) / questions.length) * 100);

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
      if (hasTheory) {
        setPhase("theory");
        return;
      }
      await doSubmit();
    };

    return (
      <div className="page-shell">
        <div className="exam-layout">
          <section className="card exam-card">
            <header className="exam-card__header">
              <div>
                <span className="eyebrow">{hasTheory ? "Section A · " : ""}{session.exam.subject} Assessment</span>
                <h1>{session.exam.title}</h1>
                <p>Question {session.currentIndex + 1} of {questions.length}</p>
              </div>
              {Timer}
            </header>

            <ProgressBar value={progress} />

            <div className="question-block">
              <h2>{currentQuestion.questionText}</h2>
              <div className="answers-grid">
                {currentQuestion.options.map((option, index) => {
                  const label = ANSWER_LABELS[index];
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
              <div className="exam-helper">You can review and change previous answers before submitting.</div>
              <div className="button-row">
                <button className="secondary-button" disabled={submitting || isFirstQuestion} onClick={movePrevious} type="button">
                  Previous Question
                </button>
                <button className="primary-button" disabled={submitting} onClick={handleNext} type="button">
                  {submitting
                    ? "Submitting..."
                    : !isLastQuestion
                      ? "Next Question"
                      : hasTheory
                        ? `Continue to ${theorySection.label || "Section B"}`
                        : "Submit Exam"}
                </button>
              </div>
            </div>
          </section>

          {Sidebar}
        </div>
      </div>
    );
  }

  // ---------------- Theory phase ----------------
  return (
    <div className="page-shell">
      <div className="exam-layout">
        <section className="card exam-card">
          <header className="exam-card__header">
            <div>
              <span className="eyebrow">{theorySection.label || "Section B"} · Written Answers</span>
              <h1>{session.exam.title}</h1>
              <p>{theoryQuestions.length} question(s)</p>
            </div>
            {Timer}
          </header>

          {theorySection.instructions ? <p className="muted-text">{theorySection.instructions}</p> : null}

          {theoryQuestions.map((question, index) => (
            <TheoryAnswerInput
              key={question.id}
              index={index}
              question={question}
              value={theoryAnswers[question.id] || {}}
              onChange={(studentAnswer) => selectTheoryAnswer(question.id, studentAnswer)}
              onSubChange={(subId, value) => setTheorySubAnswer(question.id, subId, value)}
            />
          ))}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="exam-actions">
            <div className="exam-helper">Written answers are reviewed by your teacher after you submit.</div>
            <div className="button-row">
              {hasMCQ ? (
                <button className="secondary-button" disabled={submitting} onClick={() => { setError(""); setPhase("mcq"); }} type="button">
                  Back to Section A
                </button>
              ) : null}
              <button className="primary-button" disabled={submitting} onClick={doSubmit} type="button">
                {submitting ? "Submitting..." : "Submit Exam"}
              </button>
            </div>
          </div>
        </section>

        {Sidebar}
      </div>
    </div>
  );
}
