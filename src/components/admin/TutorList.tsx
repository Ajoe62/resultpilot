import { useMemo, useState } from "react";
import { deactivateTutor } from "../../lib/apiClient";
import { useTutors } from "../../hooks/useTutors";
import { useClasses } from "../../hooks/useClasses";
import { toMillis } from "../../hooks/util";

function timeAgo(value: unknown): string {
  const ms = toMillis(value);
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Admin view of every tutor: status, assigned classes, last active, and an
// activate/deactivate toggle (server-enforced via /api/admin/deactivate-tutor).
export default function TutorList() {
  const { tutors, loading, error } = useTutors();
  const { classes } = useClasses();
  const [busyUid, setBusyUid] = useState("");
  const [actionError, setActionError] = useState("");

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((classItem) => map.set(classItem.id, classItem.name || classItem.id));
    return map;
  }, [classes]);

  const toggleActive = async (uid: string, active: boolean) => {
    setActionError("");
    setBusyUid(uid);
    try {
      await deactivateTutor(uid, !active); // reactivate = !active
    } catch (toggleError) {
      setActionError((toggleError as Error).message || "Unable to update tutor.");
    } finally {
      setBusyUid("");
    }
  };

  return (
    <div className="card list-card">
      <div className="section-heading">
        <h3>Tutors</h3>
        <p>{loading ? "Loading tutors..." : `${tutors.length} tutor(s)`}</p>
      </div>

      {error ? <p className="form-error">{error.message}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      <div className="stack-list">
        {tutors.map((tutor) => {
          const uid = tutor.uid || tutor.id;
          const active = tutor.active !== false;
          const classNames = (tutor.assignedClasses ?? [])
            .map((id) => classNameById.get(id) || id)
            .join(", ");
          return (
            <article className="stack-list__item" key={tutor.id}>
              <div>
                <strong>{tutor.name || tutor.email || uid}</strong>
                <p>
                  {tutor.email} — {active ? "Active" : "Deactivated"}
                  {tutor.inviteAccepted === false ? " (invite pending)" : ""}
                </p>
                <small>
                  Classes: {classNames || "none"} · Last active {timeAgo(tutor.lastActiveAt)}
                </small>
              </div>
              <div className="button-row">
                <button
                  className={active ? "danger-button" : "secondary-button"}
                  disabled={busyUid === uid}
                  onClick={() => toggleActive(uid, active)}
                  type="button"
                >
                  {busyUid === uid ? "..." : active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </article>
          );
        })}
        {!loading && tutors.length === 0 ? (
          <p className="muted-text">No tutors yet. Invite one to get started.</p>
        ) : null}
      </div>
    </div>
  );
}
