import { useState } from "react";
import { timeAgo } from "../../hooks/util";
import type { Result, Student } from "../../hooks/types";

interface Props {
  student: Student;
  results: Result[]; // this student's results, newest first
  flagging: boolean;
  onFlag: (note: string) => void;
  onClose: () => void;
}

// Slide-over/modal showing one student's full result history, with a flag action.
export default function StudentDetailModal({ student, results, flagging, onFlag, onClose }: Props) {
  const [note, setNote] = useState("");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel card">
        <div className="section-heading">
          <h3>{student.fullName || student.id}</h3>
          <p className="muted-text">{student.className || student.classId} · {student.admissionNumber || "no admission no."}</p>
        </div>

        <div className="card list-card">
          <div className="section-heading"><h4>Result History</h4><p>{results.length} result(s)</p></div>
          <div className="stack-list">
            {results.map((r) => (
              <article className="stack-list__item" key={r.id}>
                <div>
                  <strong>{r.examTitle}</strong>
                  <p className="muted-text">{r.subject} — {r.percentage ?? 0}% · {r.passed ? "Passed" : "Failed"}</p>
                </div>
                <small>{timeAgo(r.submittedAtMs ?? 0)}</small>
              </article>
            ))}
            {results.length === 0 ? <p className="muted-text">No results yet.</p> : null}
          </div>
        </div>

        <label className="field">
          <span>Flag for admin review (optional note)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Failed 3 exams in a row" />
        </label>

        <div className="button-row">
          <button className="danger-button" type="button" disabled={flagging} onClick={() => onFlag(note.trim())}>
            {flagging ? "Flagging…" : "Flag student"}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
