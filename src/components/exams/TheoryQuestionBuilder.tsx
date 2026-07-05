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
import type { TheoryQuestion, TheoryQuestionType } from "../../types/theory";

const TYPES: { value: TheoryQuestionType; label: string; cap: number }[] = [
  { value: "short_answer", label: "Short Answer", cap: 20 },
  { value: "essay", label: "Essay", cap: 50 },
  { value: "fill_blank", label: "Fill in the Blank", cap: 5 },
  { value: "structured", label: "Structured", cap: 100 },
];

interface RubricRow { criterion: string; maxMarks: number; descriptor: string }
interface SubRow { text: string; markingScheme: string; maxMarks: number }

interface ExamSectionConfig {
  hasTheory?: boolean;
  theorySectionLabel?: string;
  theoryInstructions?: string;
}

// Authoring for theory questions (short answer / essay / fill-blank / structured)
// plus the exam's theory-section config. Writes kind:"theory" docs into
// exams/{id}/questions; the MCQ flow ignores them until the student UI is wired.
export default function TheoryQuestionBuilder({ examId, exam }: { examId: string; exam?: ExamSectionConfig }) {
  const [questions, setQuestions] = useState<TheoryQuestion[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // section config
  const [hasTheory, setHasTheory] = useState(exam?.hasTheory ?? false);
  const [label, setLabel] = useState(exam?.theorySectionLabel ?? "Section B");
  const [instructions, setInstructions] = useState(exam?.theoryInstructions ?? "");

  // shared question fields
  const [type, setType] = useState<TheoryQuestionType>("short_answer");
  const [questionText, setQuestionText] = useState("");
  const [maxMarks, setMaxMarks] = useState(5);
  const [wordLimit, setWordLimit] = useState("");
  // short answer
  const [markingScheme, setMarkingScheme] = useState("");
  const [sampleAnswer, setSampleAnswer] = useState("");
  // essay
  const [content, setContent] = useState("");
  const [structure, setStructure] = useState("");
  const [language, setLanguage] = useState("");
  const [rubric, setRubric] = useState<RubricRow[]>([]);
  // fill blank
  const [sentence, setSentence] = useState("");
  const [acceptable, setAcceptable] = useState("");
  const [exactMatch, setExactMatch] = useState(false);
  // structured
  const [subQuestions, setSubQuestions] = useState<SubRow[]>([{ text: "", markingScheme: "", maxMarks: 2 }]);

  useEffect(() => {
    if (!examId) return;
    const q = query(collection(db, "exams", examId, "questions"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) =>
        setQuestions(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as object) }) as TheoryQuestion)
            .filter((question) => question.kind === "theory"),
        ),
      (err) => setError(err.message),
    );
    return unsub;
  }, [examId]);

  const cap = TYPES.find((t) => t.value === type)?.cap ?? 20;
  const structuredTotal = subQuestions.reduce((sum, s) => sum + Number(s.maxMarks || 0), 0);

  const resetForm = () => {
    setQuestionText("");
    setMaxMarks(5);
    setWordLimit("");
    setMarkingScheme("");
    setSampleAnswer("");
    setContent("");
    setStructure("");
    setLanguage("");
    setRubric([]);
    setSentence("");
    setAcceptable("");
    setExactMatch(false);
    setSubQuestions([{ text: "", markingScheme: "", maxMarks: 2 }]);
  };

  const saveSection = async () => {
    setError("");
    setStatus("");
    try {
      await updateDoc(doc(db, "exams", examId), {
        hasTheory,
        theorySectionLabel: label.trim() || "Section B",
        theoryInstructions: instructions.trim(),
      });
      setStatus("Theory section settings saved.");
    } catch (e) {
      setError((e as Error).message || "Unable to save section settings.");
    }
  };

  const addQuestion = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const limit = wordLimit.trim() ? Number(wordLimit) : undefined;
    const base: Record<string, unknown> = {
      kind: "theory",
      type,
      createdAt: serverTimestamp(),
    };
    if (limit && limit > 0) base.wordLimit = limit;

    let payload: Record<string, unknown>;
    if (type === "short_answer") {
      if (!questionText.trim() || !markingScheme.trim()) {
        setError("Question text and marking scheme are required.");
        return;
      }
      payload = {
        ...base,
        questionText: questionText.trim(),
        maxMarks: clamp(maxMarks, cap),
        markingScheme: markingScheme.trim(),
        ...(sampleAnswer.trim() ? { sampleAnswer: sampleAnswer.trim() } : {}),
      };
    } else if (type === "essay") {
      if (!questionText.trim() || !content.trim()) {
        setError("Question text and content criteria are required.");
        return;
      }
      payload = {
        ...base,
        questionText: questionText.trim(),
        maxMarks: clamp(maxMarks, cap),
        markingScheme: { content: content.trim(), structure: structure.trim(), language: language.trim() },
        rubric: rubric
          .filter((r) => r.criterion.trim())
          .map((r) => ({ criterion: r.criterion.trim(), maxMarks: Number(r.maxMarks || 0), descriptor: r.descriptor.trim() })),
      };
    } else if (type === "fill_blank") {
      const answers = acceptable.split(",").map((a) => a.trim()).filter(Boolean);
      if (!sentence.trim() || answers.length === 0) {
        setError("Enter the sentence (with [BLANK]) and at least one acceptable answer.");
        return;
      }
      payload = {
        ...base,
        questionText: sentence.trim(),
        sentence: sentence.trim(),
        acceptableAnswers: answers,
        exactMatch,
        maxMarks: clamp(maxMarks, cap),
      };
    } else {
      const subs = subQuestions
        .filter((s) => s.text.trim())
        .map((s, i) => ({
          id: cryptoId(),
          text: s.text.trim(),
          markingScheme: s.markingScheme.trim(),
          maxMarks: Number(s.maxMarks || 0),
          order: i,
        }));
      if (!questionText.trim() || subs.length === 0) {
        setError("Enter the scenario and at least one sub-question.");
        return;
      }
      payload = {
        ...base,
        questionText: questionText.trim(),
        subQuestions: subs,
        maxMarks: subs.reduce((sum, s) => sum + s.maxMarks, 0),
      };
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "exams", examId, "questions"), payload);
      setStatus("Theory question added.");
      resetForm();
    } catch (e) {
      setError((e as Error).message || "Unable to add question.");
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, "exams", examId, "questions", id));
    } catch (e) {
      setError((e as Error).message || "Unable to delete question.");
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h3>Theory Section</h3>
        <p>Add written-answer questions. These are graded by AI suggestion + tutor review.</p>
      </div>

      <div className="card form-card">
        <label className="checkbox-row">
          <input type="checkbox" checked={hasTheory} onChange={(e) => setHasTheory(e.target.checked)} />
          <span>Include a theory section in this exam</span>
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Section Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Section B" />
          </label>
          <label className="field">
            <span>Instructions</span>
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Answer any three questions." />
          </label>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={saveSection}>Save Section Settings</button>
        </div>
      </div>

      <div className="admin-grid">
        <form className="card form-card" onSubmit={addQuestion}>
          <label className="field">
            <span>Question Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as TheoryQuestionType)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          {type !== "fill_blank" ? (
            <label className="field">
              <span>{type === "structured" ? "Scenario / Passage" : "Question Text"}</span>
              <textarea rows={3} value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
            </label>
          ) : null}

          {type === "short_answer" ? (
            <>
              <label className="field">
                <span>Marking Scheme (what a correct answer should include)</span>
                <textarea rows={3} value={markingScheme} onChange={(e) => setMarkingScheme(e.target.value)} />
              </label>
              <label className="field">
                <span>Sample Answer (optional, helps the AI marker)</span>
                <textarea rows={2} value={sampleAnswer} onChange={(e) => setSampleAnswer(e.target.value)} />
              </label>
            </>
          ) : null}

          {type === "essay" ? (
            <>
              <label className="field"><span>Content criteria</span><textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} /></label>
              <label className="field"><span>Structure criteria</span><textarea rows={2} value={structure} onChange={(e) => setStructure(e.target.value)} /></label>
              <label className="field"><span>Language criteria</span><textarea rows={2} value={language} onChange={(e) => setLanguage(e.target.value)} /></label>
              <div className="field">
                <span>Rubric (optional)</span>
                {rubric.map((row, i) => (
                  <div className="field-grid" key={i}>
                    <input placeholder="Criterion" value={row.criterion} onChange={(e) => setRubric((r) => patch(r, i, { criterion: e.target.value }))} />
                    <input type="number" min="0" placeholder="Marks" value={row.maxMarks} onChange={(e) => setRubric((r) => patch(r, i, { maxMarks: Number(e.target.value) }))} />
                    <input placeholder="Descriptor" value={row.descriptor} onChange={(e) => setRubric((r) => patch(r, i, { descriptor: e.target.value }))} />
                  </div>
                ))}
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => setRubric((r) => [...r, { criterion: "", maxMarks: 0, descriptor: "" }])}>+ Rubric row</button>
                  {rubric.length ? <button className="secondary-button" type="button" onClick={() => setRubric((r) => r.slice(0, -1))}>Remove last</button> : null}
                </div>
              </div>
            </>
          ) : null}

          {type === "fill_blank" ? (
            <>
              <label className="field">
                <span>Sentence (mark the gap with [BLANK])</span>
                <textarea rows={2} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="The powerhouse of the cell is [BLANK]." />
              </label>
              <label className="field">
                <span>Acceptable answers (comma-separated)</span>
                <input value={acceptable} onChange={(e) => setAcceptable(e.target.value)} placeholder="mitochondria, mitochondrion" />
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={exactMatch} onChange={(e) => setExactMatch(e.target.checked)} />
                <span>Require exact match (otherwise case-insensitive)</span>
              </label>
            </>
          ) : null}

          {type === "structured" ? (
            <div className="field">
              <span>Sub-questions (total {structuredTotal} marks)</span>
              {subQuestions.map((row, i) => (
                <div className="card" key={i} style={{ padding: "0.6rem" }}>
                  <input placeholder={`(${String.fromCharCode(97 + i)}) question`} value={row.text} onChange={(e) => setSubQuestions((s) => patch(s, i, { text: e.target.value }))} />
                  <div className="field-grid">
                    <input placeholder="Marking scheme" value={row.markingScheme} onChange={(e) => setSubQuestions((s) => patch(s, i, { markingScheme: e.target.value }))} />
                    <input type="number" min="1" placeholder="Marks" value={row.maxMarks} onChange={(e) => setSubQuestions((s) => patch(s, i, { maxMarks: Number(e.target.value) }))} />
                  </div>
                </div>
              ))}
              <div className="button-row">
                <button className="secondary-button" type="button" onClick={() => setSubQuestions((s) => [...s, { text: "", markingScheme: "", maxMarks: 2 }])}>+ Sub-question</button>
                {subQuestions.length > 1 ? <button className="secondary-button" type="button" onClick={() => setSubQuestions((s) => s.slice(0, -1))}>Remove last</button> : null}
              </div>
            </div>
          ) : null}

          {type !== "structured" ? (
            <div className="field-grid">
              <label className="field">
                <span>Max Marks (1–{cap})</span>
                <input type="number" min="1" max={cap} value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value))} />
              </label>
              {type !== "fill_blank" ? (
                <label className="field">
                  <span>Word Limit (optional)</span>
                  <input type="number" min="0" value={wordLimit} onChange={(e) => setWordLimit(e.target.value)} />
                </label>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          {status ? <p className="muted-text">{status}</p> : null}

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Adding..." : "Add Theory Question"}
          </button>
        </form>

        <div className="card list-card">
          <div className="section-heading">
            <h3>Theory Questions</h3>
            <p>{questions.length} added</p>
          </div>
          <div className="stack-list">
            {questions.map((question, index) => (
              <article className="stack-list__item" key={question.id}>
                <div>
                  <strong>{index + 1}. {question.questionText}</strong>
                  <p className="muted-text">{labelFor(question.type)} · {question.maxMarks} marks</p>
                </div>
                <button className="danger-button" type="button" onClick={() => removeQuestion(question.id)}>Delete</button>
              </article>
            ))}
            {questions.length === 0 ? <p className="muted-text">No theory questions yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function clamp(value: number, cap: number): number {
  return Math.max(1, Math.min(cap, Math.round(Number(value) || 1)));
}

function patch<T>(rows: T[], index: number, changes: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...changes } : row));
}

function labelFor(type: TheoryQuestionType): string {
  return TYPES.find((t) => t.value === type)?.label ?? type;
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sub-${Math.random().toString(36).slice(2)}`;
}
