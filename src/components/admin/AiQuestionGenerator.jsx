import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { generateFromDocument } from "../../lib/apiClient";

const ANSWER_LETTERS = ["A", "B", "C", "D"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const MIN_COUNT = 1;
const MAX_COUNT = 20;

const INITIAL_FORM = {
  subject: "",
  topic: "",
  difficulty: "medium",
  count: 5,
};

// Generates MCQs with the AI engine, then lets the admin review/edit each
// question before a single batched write to the selected exam's questions.
export default function AiQuestionGenerator({ selectedExamId, defaultSubject }) {
  const [form, setForm] = useState({ ...INITIAL_FORM, subject: defaultSubject || "" });
  const [sourceMode, setSourceMode] = useState("topic");
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Keep the subject in step with the selected exam until the admin edits it.
  useEffect(() => {
    setForm((current) => ({ ...current, subject: defaultSubject || "" }));
  }, [defaultSubject]);

  // Uploaded study documents available as generation sources.
  useEffect(() => {
    const documentsQuery = query(
      collection(db, "studyDocuments"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(documentsQuery, (snapshot) => {
      setDocuments(
        snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      );
    });
    return unsubscribe;
  }, []);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateDraft = (index, changes) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...changes } : draft,
      ),
    );
  };

  const updateDraftOption = (index, optionIndex, value) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== index) {
          return draft;
        }
        const options = [...draft.options];
        options[optionIndex] = value;
        return { ...draft, options };
      }),
    );
  };

  const removeDraft = (index) => {
    setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const count = Number(form.count);
    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
      setError(`Count must be a whole number between ${MIN_COUNT} and ${MAX_COUNT}.`);
      return;
    }
    if (sourceMode === "topic" && (!form.subject.trim() || !form.topic.trim())) {
      setError("Subject and topic are required.");
      return;
    }
    if (sourceMode === "document" && !documentId) {
      setError("Choose a study document to generate from.");
      return;
    }

    setGenerating(true);
    try {
      let questions;
      if (sourceMode === "document") {
        const payload = await generateFromDocument({
          documentId,
          difficulty: form.difficulty,
          count,
          topic: form.topic.trim(),
        });
        questions = Array.isArray(payload.questions) ? payload.questions : [];
      } else {
        const response = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: form.subject.trim(),
            topic: form.topic.trim(),
            difficulty: form.difficulty,
            count,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || `Generation failed (${response.status}).`);
        }
        questions = Array.isArray(payload.questions) ? payload.questions : [];
      }

      if (!questions.length) {
        throw new Error("No questions were returned. Try again or adjust your inputs.");
      }

      setDrafts(questions);
      setStatus(`Generated ${questions.length} question(s). Review and edit, then save.`);
    } catch (generationError) {
      setError(generationError.message || "Unable to generate questions.");
    } finally {
      setGenerating(false);
    }
  };

  const validateDraft = (draft, position) => {
    const questionText = draft.questionText.trim();
    const options = draft.options.map((option) => option.trim());

    if (!questionText) {
      return `Question ${position}: question text is required.`;
    }
    if (options.some((option) => !option)) {
      return `Question ${position}: all four options are required.`;
    }
    if (new Set(options).size !== options.length) {
      return `Question ${position}: each option must be different.`;
    }
    if (!ANSWER_LETTERS.includes(draft.correctAnswer)) {
      return `Question ${position}: select a valid correct answer.`;
    }
    return "";
  };

  const handleSaveAll = async () => {
    setError("");
    setStatus("");

    if (!selectedExamId) {
      setError("Select an exam before saving questions.");
      return;
    }
    if (!drafts.length) {
      return;
    }

    for (let index = 0; index < drafts.length; index += 1) {
      const validationError = validateDraft(drafts[index], index + 1);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const questionsRef = collection(db, "exams", selectedExamId, "questions");

      drafts.forEach((draft) => {
        batch.set(doc(questionsRef), {
          questionText: draft.questionText.trim(),
          options: draft.options.map((option) => option.trim()),
          correctAnswer: draft.correctAnswer,
          createdAt: serverTimestamp(),
          source: "ai",
        });
      });

      await batch.commit();
      setStatus(`Saved ${drafts.length} question(s) to the exam.`);
      setDrafts([]);
    } catch (saveError) {
      setError(saveError.message || "Unable to save questions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card form-card">
      <div className="section-heading">
        <h3>Generate with AI</h3>
        <p>Draft a full MCQ set, then review every question before saving.</p>
      </div>

      <form onSubmit={handleGenerate}>
        <label className="field">
          <span>Source</span>
          <select
            value={sourceMode}
            onChange={(event) => setSourceMode(event.target.value)}
          >
            <option value="topic">Topic (general knowledge)</option>
            <option value="document">Uploaded document (grounded)</option>
          </select>
        </label>

        {sourceMode === "topic" ? (
          <div className="field-grid">
            <label className="field">
              <span>Subject</span>
              <input
                value={form.subject}
                onChange={(event) => updateForm("subject", event.target.value)}
                placeholder="HTML"
              />
            </label>

            <label className="field">
              <span>Topic</span>
              <input
                value={form.topic}
                onChange={(event) => updateForm("topic", event.target.value)}
                placeholder="Semantic elements"
              />
            </label>
          </div>
        ) : (
          <div className="field-grid">
            <label className="field">
              <span>Document</span>
              <select
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
              >
                <option value="">Select a document</option>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                    {document.subject ? ` (${document.subject})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Focus Topic (optional)</span>
              <input
                value={form.topic}
                onChange={(event) => updateForm("topic", event.target.value)}
                placeholder="e.g. photosynthesis"
              />
            </label>
          </div>
        )}

        {sourceMode === "document" && !documents.length ? (
          <p className="muted-text">
            No documents yet. Upload one in Study Documents first.
          </p>
        ) : null}

        <div className="field-grid">
          <label className="field">
            <span>Difficulty</span>
            <select
              value={form.difficulty}
              onChange={(event) => updateForm("difficulty", event.target.value)}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Number of Questions</span>
            <input
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={form.count}
              onChange={(event) => updateForm("count", event.target.value)}
            />
          </label>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="muted-text">{status}</p> : null}

        <div className="button-row">
          <button className="primary-button" type="submit" disabled={generating || saving}>
            {generating ? "Generating..." : "Generate with AI"}
          </button>
          {drafts.length ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDrafts([])}
              disabled={generating || saving}
            >
              Discard Draft
            </button>
          ) : null}
        </div>
      </form>

      {drafts.length ? (
        <div className="stack-list" style={{ marginTop: "1rem" }}>
          <div className="section-heading">
            <h4>Review &amp; Edit ({drafts.length})</h4>
            <p>Edit any field below. Nothing is saved until you click Save All.</p>
          </div>

          {drafts.map((draft, index) => (
            <article className="stack-list__item" key={index}>
              <div style={{ width: "100%" }}>
                <label className="field">
                  <span>Question {index + 1}</span>
                  <textarea
                    rows="3"
                    value={draft.questionText}
                    onChange={(event) =>
                      updateDraft(index, { questionText: event.target.value })
                    }
                  />
                </label>

                <div className="options-grid">
                  {ANSWER_LETTERS.map((label, optionIndex) => (
                    <label className="field" key={label}>
                      <span>Option {label}</span>
                      <input
                        value={draft.options[optionIndex] ?? ""}
                        onChange={(event) =>
                          updateDraftOption(index, optionIndex, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>

                <label className="field">
                  <span>Correct Answer</span>
                  <select
                    value={draft.correctAnswer}
                    onChange={(event) =>
                      updateDraft(index, { correctAnswer: event.target.value })
                    }
                  >
                    {ANSWER_LETTERS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="button-row">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => removeDraft(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={handleSaveAll}
              disabled={saving || !selectedExamId}
            >
              {saving ? "Saving..." : `Save All (${drafts.length}) to Exam`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
