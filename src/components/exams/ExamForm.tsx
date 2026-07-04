import { useState } from "react";
import type { FormEvent } from "react";
// Loose JS module (assessment metadata). Types are inferred as any — fine here.
import { ASSESSMENT_TYPES, DEFAULT_ASSESSMENT_TYPE } from "../../lib/assessmentTypes";

const TERMS = ["First Term", "Second Term", "Third Term"];

export interface ExamFormValues {
  title: string;
  subject: string;
  academicSession: string;
  term: string;
  duration: number;
  pin: string;
  passmark: number;
  assessmentType: string;
  isActive: boolean;
}

interface AssessmentType {
  value: string;
  label: string;
  maxScore: number;
}

interface ExamFormProps {
  initial?: Partial<ExamFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  error?: string;
  status?: string;
  onSubmit: (values: ExamFormValues) => void;
}

function defaultSession(): string {
  const y = new Date().getFullYear();
  return `${y}/${y + 1}`;
}

// Presentational exam create/edit form shared by admin and tutor screens. Field
// validation lives here; async errors (e.g. PIN conflicts) come via `error`.
export default function ExamForm({
  initial,
  submitting = false,
  submitLabel = "Save Exam",
  error,
  status,
  onSubmit,
}: ExamFormProps) {
  const [values, setValues] = useState<ExamFormValues>({
    title: initial?.title ?? "",
    subject: initial?.subject ?? "",
    academicSession: initial?.academicSession ?? defaultSession(),
    term: initial?.term ?? TERMS[0],
    duration: initial?.duration ?? 30,
    pin: initial?.pin ?? "",
    passmark: initial?.passmark ?? 50,
    assessmentType: initial?.assessmentType ?? DEFAULT_ASSESSMENT_TYPE,
    isActive: initial?.isActive ?? true,
  });
  const [localError, setLocalError] = useState("");

  const set = <K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    const duration = Number(values.duration);
    const passmark = Number(values.passmark);
    if (!values.title.trim() || !values.subject.trim() || !values.pin.trim()) {
      setLocalError("Title, subject and PIN are required.");
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
      setLocalError("Duration must be a whole number between 1 and 300 minutes.");
      return;
    }
    if (!Number.isFinite(passmark) || passmark < 0 || passmark > 100) {
      setLocalError("Pass mark must be between 0 and 100.");
      return;
    }
    onSubmit({ ...values, duration, passmark });
  };

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <label className="field">
        <span>Exam Title</span>
        <input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Biology Midterm" />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Subject</span>
          <input value={values.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Biology" />
        </label>
        <label className="field">
          <span>Academic Session</span>
          <input value={values.academicSession} onChange={(e) => set("academicSession", e.target.value)} placeholder="2025/2026" />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Term</span>
          <select value={values.term} onChange={(e) => set("term", e.target.value)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Duration (minutes)</span>
          <input type="number" min="1" value={values.duration} onChange={(e) => set("duration", Number(e.target.value))} />
        </label>
      </div>

      <label className="field">
        <span>Assessment Type</span>
        <select value={values.assessmentType} onChange={(e) => set("assessmentType", e.target.value)}>
          {(ASSESSMENT_TYPES as AssessmentType[]).map((t) => (
            <option key={t.value} value={t.value}>{t.label} ({t.maxScore} marks)</option>
          ))}
        </select>
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Access PIN</span>
          <input value={values.pin} onChange={(e) => set("pin", e.target.value)} placeholder="BIO2026" />
        </label>
        <label className="field">
          <span>Pass Mark (%)</span>
          <input type="number" min="0" max="100" value={values.passmark} onChange={(e) => set("passmark", Number(e.target.value))} />
        </label>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={values.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        <span>Activate exam immediately</span>
      </label>

      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      {status ? <p className="muted-text">{status}</p> : null}

      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
