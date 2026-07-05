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
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
// Admin AI generator (reads studyDocuments, which are admin-only) — shown only
// when the caller opts in via `showAiGenerator`.
import AiQuestionGenerator from "../admin/AiQuestionGenerator";

// Raw question doc — loose because the subcollection is mixed: legacy MCQ (no
// `kind`), kind:"mcq", and kind:"theory". MCQ fields are therefore optional.
interface QDoc {
  id: string;
  kind?: string;
  questionText?: string;
  options?: string[];
  correctAnswer?: string;
}

const OPTIONS = ["A", "B", "C", "D"] as const;
type OptionLetter = (typeof OPTIONS)[number];

interface QuestionForm {
  questionText: string;
  options: string[];
  correctAnswer: OptionLetter;
}

const EMPTY: QuestionForm = { questionText: "", options: ["", "", "", ""], correctAnswer: "A" };

function validate(form: QuestionForm): string {
  const questionText = form.questionText.trim();
  const options = form.options.map((o) => o.trim());
  if (!questionText) return "Question text is required.";
  if (options.some((o) => !o)) return "All four options are required.";
  if (new Set(options).size !== options.length) return "Each option must be different.";
  if (!OPTIONS.includes(form.correctAnswer)) return "Select a valid correct answer.";
  return "";
}

interface Props {
  examId: string;
  showAiGenerator?: boolean;
  subject?: string;
}

// Adds/edits/deletes MCQ questions for one exam. Shared by admin and tutor; the
// caller passes the examId (rules authorise writes by exam ownership). New
// questions carry kind:"mcq"; edits leave existing docs' other fields intact.
export default function QuestionEditor({ examId, showAiGenerator = false, subject }: Props) {
  const [questions, setQuestions] = useState<QDoc[]>([]);
  const [form, setForm] = useState<QuestionForm>(EMPTY);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!examId) return;
    const q = query(collection(db, "exams", examId, "questions"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as QDoc)),
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

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        questionText: form.questionText.trim(),
        options: form.options.map((o) => o.trim()),
        correctAnswer: form.correctAnswer,
      };
      if (editingId) {
        await updateDoc(doc(db, "exams", examId, "questions", editingId), payload);
      } else {
        await addDoc(collection(db, "exams", examId, "questions"), {
          kind: "mcq",
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e) {
      setError((e as Error).message || "Unable to save question.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (question: QDoc) => {
    setEditingId(question.id);
    setForm({
      questionText: question.questionText ?? "",
      options: [0, 1, 2, 3].map((i) => question.options?.[i] ?? ""),
      correctAnswer: (question.correctAnswer as OptionLetter) ?? "A",
    });
  };

  const removeQuestion = async (questionId: string) => {
    setError("");
    try {
      await deleteDoc(doc(db, "exams", examId, "questions", questionId));
    } catch (e) {
      setError((e as Error).message || "Unable to delete question.");
    }
  };

  // Theory questions share this subcollection but are managed in the theory
  // builder, so the MCQ list shows objective questions only.
  const mcqQuestions = questions.filter((q) => q.kind !== "theory");

  return (
    <>
      {showAiGenerator ? <AiQuestionGenerator selectedExamId={examId} defaultSubject={subject} /> : null}

      <div className="admin-grid">
        <form className="card form-card" onSubmit={submit}>
          <div className="section-heading">
            <h3>{editingId ? "Edit Question" : "Add Question"}</h3>
            <p>Multiple choice — four options, one correct answer.</p>
          </div>
          <label className="field">
            <span>Question Text</span>
            <textarea
              rows={4}
              value={form.questionText}
              onChange={(e) => setForm((c) => ({ ...c, questionText: e.target.value }))}
              placeholder="What is the powerhouse of the cell?"
            />
          </label>
          <div className="options-grid">
            {OPTIONS.map((letter, index) => (
              <label className="field" key={letter}>
                <span>Option {letter}</span>
                <input value={form.options[index]} onChange={(e) => setOption(index, e.target.value)} />
              </label>
            ))}
          </div>
          <label className="field">
            <span>Correct Answer</span>
            <select value={form.correctAnswer} onChange={(e) => setForm((c) => ({ ...c, correctAnswer: e.target.value as OptionLetter }))}>
              {OPTIONS.map((letter) => (
                <option key={letter} value={letter}>{letter}</option>
              ))}
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="button-row">
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Saving..." : editingId ? "Update Question" : "Add Question"}
            </button>
            {editingId ? (
              <button className="secondary-button" type="button" onClick={resetForm}>Cancel Edit</button>
            ) : null}
          </div>
        </form>

        <div className="card list-card">
          <div className="section-heading">
            <h3>Objective Questions</h3>
            <p>{mcqQuestions.length} added</p>
          </div>
          <div className="stack-list">
            {mcqQuestions.map((question, index) => (
              <article className="stack-list__item" key={question.id}>
                <div>
                  <strong>{index + 1}. {question.questionText}</strong>
                  <ul className="plain-list">
                    {(question.options ?? []).map((option, optionIndex) => {
                      const letter = OPTIONS[optionIndex];
                      const isCorrect = question.correctAnswer === letter;
                      return (
                        <li key={`${question.id}-${letter}`}>
                          <span>{letter}.</span> {option}{isCorrect ? " (Correct)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => startEdit(question)}>Edit</button>
                  <button className="danger-button" type="button" onClick={() => removeQuestion(question.id)}>Delete</button>
                </div>
              </article>
            ))}
            {mcqQuestions.length === 0 ? <p className="muted-text">No objective questions added to this exam yet.</p> : null}
          </div>
        </div>
      </div>
    </>
  );
}
