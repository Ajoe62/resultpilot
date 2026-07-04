import { useMemo, useState } from "react";
import { useTutors } from "../../hooks/useTutors";
import { useClasses } from "../../hooks/useClasses";
import { useExams } from "../../hooks/useExams";
import { useResults } from "../../hooks/useResults";
import { rollupByTutor } from "../../lib/tutorStats";
import { timeAgo, toMillis } from "../../hooks/util";
import TutorDetailPanel from "./TutorDetailPanel";
import type { Tutor } from "../../hooks/types";

// Admin roster of tutors with per-tutor stats. Click a row for the detail panel
// (profile, their exams, class performance, reassign classes, deactivate).
export default function TutorList() {
  const { tutors, loading, error } = useTutors();
  const { classes } = useClasses();
  const { exams } = useExams();
  const { results } = useResults();
  const [selected, setSelected] = useState<Tutor | null>(null);

  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((c) => m.set(c.id, c.name || c.id));
    return m;
  }, [classes]);

  const statsByUid = useMemo(() => {
    const m = new Map<string, ReturnType<typeof rollupByTutor>[number]>();
    for (const row of rollupByTutor(exams, results, tutors)) m.set(row.uid, row);
    return m;
  }, [exams, results, tutors]);

  return (
    <div className="card table-card">
      <div className="section-heading">
        <h3>Tutors</h3>
        <p>{loading ? "Loading tutors…" : `${tutors.length} tutor(s)`}</p>
      </div>
      {error ? <p className="form-error">{error.message}</p> : null}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Classes</th><th>Exams</th><th>Pass rate</th><th>Last active</th><th>Status</th></tr>
          </thead>
          <tbody>
            {tutors.map((tutor) => {
              const uid = tutor.uid || tutor.id;
              const stat = statsByUid.get(uid);
              const classNames = (tutor.assignedClasses ?? []).map((id) => classNameById.get(id) || id).join(", ");
              return (
                <tr key={tutor.id} style={{ cursor: "pointer" }} onClick={() => setSelected(tutor)}>
                  <td>{tutor.name || uid}</td>
                  <td>{tutor.email}</td>
                  <td>{classNames || "—"}</td>
                  <td>{stat?.examsCreated ?? 0}</td>
                  <td>{stat ? `${stat.passRate}%` : "—"}</td>
                  <td>{timeAgo(toMillis(tutor.lastActiveAt))}</td>
                  <td>
                    {tutor.active === false ? "Deactivated" : "Active"}
                    {tutor.inviteAccepted === false ? " (pending)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && tutors.length === 0 ? <p className="muted-text">No tutors yet. Invite one to get started.</p> : null}
      </div>

      {selected ? (
        <TutorDetailPanel
          tutor={selected}
          exams={exams}
          results={results}
          classes={classes}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
