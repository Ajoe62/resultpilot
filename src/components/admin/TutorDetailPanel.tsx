import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { deactivateTutor } from "../../lib/apiClient";
import { resultsForTutor } from "../../lib/tutorStats";
import { passRate, summariseByExam } from "../../lib/analytics";
import type { ClassRoom, Exam, Result, Tutor } from "../../hooks/types";

interface Props {
  tutor: Tutor;
  exams: Exam[];
  results: Result[];
  classes: ClassRoom[];
  onClose: () => void;
}

// Slide-over for one tutor: profile, their exams, class performance, reassign
// classes (writes the tutor doc — rules allow the admin), and deactivate/reactivate.
export default function TutorDetailPanel({ tutor, exams, results, classes, onClose }: Props) {
  const { schoolId } = useAuth();
  const uid = tutor.uid || tutor.id;
  const active = tutor.active !== false;

  const [selectedClasses, setSelectedClasses] = useState<string[]>(tutor.assignedClasses ?? []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const theirExams = useMemo(() => exams.filter((e) => e.tutorId === uid), [exams, uid]);
  const theirResults = useMemo(() => resultsForTutor(uid, exams, results), [uid, exams, results]);
  const perExam = useMemo(() => summariseByExam(theirResults), [theirResults]);

  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((c) => m.set(c.id, c.name || c.id));
    return m;
  }, [classes]);

  const toggleClass = (id: string) =>
    setSelectedClasses((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  const saveClasses = async () => {
    setError("");
    setStatus("");
    if (!schoolId) return;
    setBusy("classes");
    try {
      await updateDoc(doc(db, "schools", schoolId, "tutors", uid), { assignedClasses: selectedClasses });
      setStatus("Classes updated. Takes effect when the tutor next reloads.");
    } catch (e) {
      setError((e as Error).message || "Unable to reassign classes.");
    } finally {
      setBusy("");
    }
  };

  const toggleActive = async () => {
    setError("");
    setStatus("");
    setBusy("active");
    try {
      await deactivateTutor(uid, !active); // reactivate = !active
      setStatus(active ? "Tutor deactivated." : "Tutor reactivated.");
    } catch (e) {
      setError((e as Error).message || "Unable to update tutor.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel card">
        <div className="section-heading">
          <h3>{tutor.name || tutor.email || uid}</h3>
          <p className="muted-text">{tutor.email} · {active ? "Active" : "Deactivated"}{tutor.inviteAccepted === false ? " · invite pending" : ""}</p>
        </div>

        {status ? <p className="muted-text">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <div className="card list-card">
          <div className="section-heading"><h4>Exams Created</h4><p>{theirExams.length}</p></div>
          <div className="stack-list">
            {perExam.map((s) => (
              <article className="stack-list__item" key={s.examId}>
                <div><strong>{s.examTitle}</strong><p className="muted-text">avg {s.average}% · {s.passCount} passed / {s.failCount} failed</p></div>
              </article>
            ))}
            {theirExams.length === 0 ? <p className="muted-text">No exams created yet.</p> : null}
          </div>
        </div>

        <div className="card">
          <h4>Class Performance</h4>
          <p className="muted-text">
            {theirResults.length} submission(s) · overall pass rate {passRate(theirResults)}%
          </p>
        </div>

        <div className="card">
          <div className="section-heading"><h4>Reassign Classes</h4></div>
          <div className="stack-list">
            {classes.map((c) => (
              <label className="checkbox-row" key={c.id}>
                <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={() => toggleClass(c.id)} />
                <span>{classNameById.get(c.id)}</span>
              </label>
            ))}
            {classes.length === 0 ? <p className="muted-text">No classes yet.</p> : null}
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" disabled={busy === "classes"} onClick={saveClasses}>
              {busy === "classes" ? "Saving…" : "Save Classes"}
            </button>
          </div>
        </div>

        <div className="button-row">
          <button className={active ? "danger-button" : "secondary-button"} type="button" disabled={busy === "active"} onClick={toggleActive}>
            {busy === "active" ? "…" : active ? "Deactivate Account" : "Reactivate Account"}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
