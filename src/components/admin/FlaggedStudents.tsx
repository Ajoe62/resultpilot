import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFlags } from "../../hooks/useFlags";
import { timeAgo, toMillis } from "../../hooks/util";

// Admin review inbox for student flags raised by tutors.
export default function FlaggedStudents() {
  const { flags, loading, error } = useFlags();
  const [busyId, setBusyId] = useState("");
  const open = flags.filter((f) => !f.resolved);

  const resolve = async (id: string) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, "flags", id), { resolved: true, resolvedAt: serverTimestamp() });
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="card list-card">
      <div className="section-heading">
        <h3>Flagged Students</h3>
        <p>{loading ? "Loading…" : `${open.length} awaiting review`}</p>
      </div>
      {error ? <p className="form-error">{error.message}</p> : null}
      <div className="stack-list">
        {open.map((flag) => (
          <article className="stack-list__item" key={flag.id}>
            <div>
              <strong>{flag.studentName || flag.studentId || "Student"}</strong>
              <p className="muted-text">{flag.note || "No note"}</p>
              <small>{timeAgo(toMillis(flag.createdAt))}</small>
            </div>
            <button className="secondary-button" type="button" disabled={busyId === flag.id} onClick={() => resolve(flag.id)}>
              {busyId === flag.id ? "…" : "Resolve"}
            </button>
          </article>
        ))}
        {!loading && open.length === 0 ? <p className="muted-text">No flags awaiting review.</p> : null}
      </div>
    </div>
  );
}
