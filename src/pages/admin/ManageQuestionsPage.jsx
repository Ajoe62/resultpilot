import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";

const INITIAL_FORM = {
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: "A",
};

function validateQuestionForm(form) {
  const questionText = form.questionText.trim();
  const normalizedOptions = form.options.map((option) => option.trim());
  const correctIndex = ["A", "B", "C", "D"].indexOf(form.correctAnswer);

  if (!questionText) {
    return "Question text is required.";
  }

  if (normalizedOptions.some((option) => !option)) {
    return "All four options are required.";
  }

  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    return "Each option must be different.";
  }

  if (correctIndex === -1 || !normalizedOptions[correctIndex]) {
    return "Select a valid correct answer.";
  }

  return "";
}

export default function ManageQuestionsPage() {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "exams"),
      (snapshot) => {
        const nextExams = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }))
          .filter((exam) => !exam.isArchived);
        setExams(nextExams);
        setSelectedExamId((current) => {
          if (!nextExams.length) {
            return "";
          }

          if (current && nextExams.some((exam) => exam.id === current)) {
            return current;
          }

          return nextExams[0].id;
        });
      },
      (snapshotError) => setError(snapshotError.message),
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedExamId) {
      setQuestions([]);
      return undefined;
    }

    const questionsQuery = query(
      collection(db, "exams", selectedExamId, "questions"),
      orderBy("createdAt", "asc"),
    );

    const unsubscribe = onSnapshot(
      questionsQuery,
      (snapshot) => {
        setQuestions(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })),
        );
      },
      (snapshotError) => setError(snapshotError.message),
    );

    return unsubscribe;
  }, [selectedExamId]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingId("");
  };

  const updateOption = (index, value) => {
    setForm((current) => {
      const nextOptions = [...current.options];
      nextOptions[index] = value;

      return {
        ...current,
        options: nextOptions,
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!selectedExamId) {
      setError("Create an exam before adding questions.");
      return;
    }

    const validationError = validateQuestionForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      questionText: form.questionText.trim(),
      options: form.options.map((option) => option.trim()),
      correctAnswer: form.correctAnswer,
    };

    try {
      if (editingId) {
        await updateDoc(
          doc(db, "exams", selectedExamId, "questions", editingId),
          payload,
        );
      } else {
        await addDoc(collection(db, "exams", selectedExamId, "questions"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      resetForm();
    } catch (submissionError) {
      setError(submissionError.message || "Unable to save question.");
    }
  };

  const startEdit = (question) => {
    setEditingId(question.id);
    setForm({
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
    });
  };

  const removeQuestion = async (questionId) => {
    await deleteDoc(doc(db, "exams", selectedExamId, "questions", questionId));
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Manage Questions</h2>
        <p>Attach multiple-choice questions to any exam.</p>
      </div>

      <div className="admin-grid">
        <div className="card form-card">
          <label className="field">
            <span>Select Exam</span>
            <select
              value={selectedExamId}
              onChange={(event) => {
                setSelectedExamId(event.target.value);
                resetForm();
              }}
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} ({exam.subject})
                </option>
              ))}
            </select>
          </label>

          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Question Text</span>
              <textarea
                rows="4"
                value={form.questionText}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    questionText: event.target.value,
                  }))
                }
                placeholder="What does CSS stand for?"
              />
            </label>

            <div className="options-grid">
              {["A", "B", "C", "D"].map((label, index) => (
                <label className="field" key={label}>
                  <span>Option {label}</span>
                  <input
                    value={form.options[index]}
                    onChange={(event) => updateOption(index, event.target.value)}
                    placeholder={`Enter option ${label}`}
                  />
                </label>
              ))}
            </div>

            <label className="field">
              <span>Correct Answer</span>
              <select
                value={form.correctAnswer}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    correctAnswer: event.target.value,
                  }))
                }
              >
                {["A", "B", "C", "D"].map((answer) => (
                  <option key={answer} value={answer}>
                    {answer}
                  </option>
                ))}
              </select>
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="button-row">
              <button className="primary-button" type="submit">
                {editingId ? "Update Question" : "Add Question"}
              </button>
              {editingId ? (
                <button className="secondary-button" onClick={resetForm} type="button">
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card list-card">
          <div className="section-heading">
            <h3>Questions</h3>
            <p>{selectedExamId ? `${questions.length} questions` : "Select an exam"}</p>
          </div>
          <div className="stack-list">
            {questions.map((question, index) => (
              <article className="stack-list__item" key={question.id}>
                <div>
                  <strong>
                    {index + 1}. {question.questionText}
                  </strong>
                  <ul className="plain-list">
                    {question.options.map((option, optionIndex) => {
                      const label = ["A", "B", "C", "D"][optionIndex];
                      const isCorrect = question.correctAnswer === label;

                      return (
                        <li key={`${question.id}-${label}`}>
                          <span>{label}.</span> {option}
                          {isCorrect ? " (Correct)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => startEdit(question)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => removeQuestion(question.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {!questions.length ? (
              <p className="muted-text">No questions added to this exam yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
