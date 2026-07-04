import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { MCQQuestion } from "../../types/theory";

const OPTIONS = ["A", "B", "C", "D"] as const;
type OptionLetter = (typeof OPTIONS)[number];

const EMPTY = { questionText: "", options: ["", "", "", ""], correctAnswer: "A" as OptionLetter };

// Adds/lists/deletes MCQ questions for a single exam. Shared by admin and tutor;
// the caller passes the examId (rules authorise writes by exam ownership).
export default function QuestionEditor({ examId }: { examId: string }) {
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!examId) return;
    const q = query(collection(db, "exams", examId, "questions"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as MCQQuestion)),
      (err) => setError(err.message),
    );
    return unsub;
  }, [examId]);

  const setOption = (index: number, value: string) =>
    setForm((current) => {
      const options = [...current.options];
      options[index] = value;
      return { ...current, options };
    });

  const addQuestion = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const text = form.questionText.trim();
    const options = form.options.map((o) => o.trim());
    if (!text || options.some((o) => !o)) {
      setError("Enter the question and all four options.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "exams", examId, "questions"), {
        kind: "mcq",
        questionText: text,
        options,
        correctAnswer: form.correctAnswer,
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
    } catch (addError) {
      setError((addError as Error).message || "Unable to add question.");
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async (questionId: string) => {
    setError("");
    try {
      await deleteDoc(doc(db, "exams", examId, "questions", questionId));
    } catch (delError) {
      setError((delError as Error).message || "Unable to delete question.");
    }
  };

  return (
    <div className="admin-grid">
      <form className="card form-card" onSubmit={addQuestion}>
        <div className="section-heading">
          <h3>Add Question</h3>
          <p>Multiple choice — four options, one correct answer.</p>
        </div>
        <label className="field">
          <span>Question</span>
          <input value={form.questionText} onChange={(e) => setForm((c) => ({ ...c, questionText: e.target.value }))} placeholder="What is the powerhouse of the cell?" />
        </label>
        {OPTIONS.map((letter, index) => (
          <label className="field" key={letter}>
            <span>Option {letter}</span>
            <input value={form.options[index]} onChange={(e) => setOption(index, e.target.value)} />
          </label>
        ))}
        <label className="field">
          <span>Correct Answer</span>
          <select value={form.correctAnswer} onChange={(e) => setForm((c) => ({ ...c, correctAnswer: e.target.value as OptionLetter }))}>
            {OPTIONS.map((letter) => (
              <option key={letter} value={letter}>{letter}</option>
            ))}
          </select>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Adding..." : "Add Question"}
        </button>
      </form>

      <div className="card list-card">
        <div className="section-heading">
          <h3>Questions</h3>
          <p>{questions.length} added</p>
        </div>
        <div className="stack-list">
          {questions.map((question, index) => (
            <article className="stack-list__item" key={question.id}>
              <div>
                <strong>{index + 1}. {question.questionText}</strong>
                <p className="muted-text">Correct: {question.correctAnswer}</p>
              </div>
              <button className="danger-button" type="button" onClick={() => removeQuestion(question.id)}>
                Delete
              </button>
            </article>
          ))}
          {questions.length === 0 ? <p className="muted-text">No questions yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
