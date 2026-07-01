import { collection, getDocs, query, where } from "firebase/firestore/lite";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { liteDb } from "../lib/firebase";
import { ragQuery } from "../lib/apiClient";

// Student-facing RAG study assistant. Students pick an active exam that has
// linked study material and ask questions; answers are grounded server-side
// in that document. No login required (matches the exam flow).
export default function StudyAssistantPage() {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function loadExams() {
      try {
        const snapshot = await getDocs(
          query(collection(liteDb, "exams"), where("isActive", "==", true)),
        );
        if (!active) {
          return;
        }
        const withDocuments = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter((exam) => exam.studyDocumentId);
        setExams(withDocuments);
        setSelectedExamId((current) => current || withDocuments[0]?.id || "");
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load study material.");
        }
      }
    }
    loadExams();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, loading]);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId);

  const handleAsk = async (event) => {
    event.preventDefault();
    setError("");

    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    if (!selectedExamId) {
      setError("Select a subject with study material first.");
      return;
    }

    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await ragQuery({ examId: selectedExamId, question: trimmed });
      setMessages((current) => [
        ...current,
        { role: "assistant", text: response.answer, sources: response.sources || [] },
      ]);
    } catch (askError) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: askError.message || "Sorry, I couldn't answer that right now.",
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Reset the thread when switching subjects — answers are per-document.
  const handleExamChange = (event) => {
    setSelectedExamId(event.target.value);
    setMessages([]);
    setError("");
  };

  return (
    <div className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">ResultPilot</span>
          <h1>Study Assistant</h1>
          <p>
            Ask questions about your course material and get answers grounded in the
            document your tutor uploaded — not random internet facts.
          </p>
          <Link className="secondary-button" to="/">
            Back to exam
          </Link>
        </div>

        <div className="card form-card">
          <label className="field">
            <span>Subject</span>
            <select value={selectedExamId} onChange={handleExamChange}>
              <option value="" disabled>
                {exams.length ? "Select a subject" : "No study material available yet"}
              </option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subject} - {exam.studyDocumentTitle || exam.title}
                </option>
              ))}
            </select>
          </label>

          <div className="chat-thread" ref={threadRef}>
            {messages.length === 0 ? (
              <p className="muted-text">
                {selectedExam
                  ? `Ask anything about "${selectedExam.studyDocumentTitle || selectedExam.title}".`
                  : "Choose a subject to begin."}
              </p>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`chat-bubble chat-bubble--${message.role}${
                  message.isError ? " chat-bubble--error" : ""
                }`}
              >
                <p>{message.text}</p>
                {message.sources && message.sources.length ? (
                  <details className="chat-sources">
                    <summary>Sources ({message.sources.length})</summary>
                    {message.sources.map((source, sourceIndex) => (
                      <p key={sourceIndex} className="muted-text">
                        <strong>{source.label}:</strong> {source.snippet}...
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>
            ))}

            {loading ? <p className="muted-text">Thinking...</p> : null}
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <form className="chat-input-row" onSubmit={handleAsk}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Type your question..."
              disabled={!selectedExamId || loading}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={!selectedExamId || loading || !question.trim()}
            >
              Ask
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
