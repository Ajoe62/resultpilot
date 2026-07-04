import { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useStudents } from "../../hooks/useStudents";
import { useResults } from "../../hooks/useResults";
import { useClasses } from "../../hooks/useClasses";
import { summariseByStudent } from "../../lib/analytics";
import { timeAgo } from "../../hooks/util";
import StudentDetailModal from "../../components/tutor/StudentDetailModal";
import type { Result, Student } from "../../hooks/types";

const TREND_LABEL: Record<string, string> = { up: "▲ up", down: "▼ down", neutral: "– steady" };

export default function TutorStudentList() {
  const { schoolId, currentUser } = useAuth();
  const { students, loading } = useStudents();
  const { results } = useResults();
  const { classes } = useClasses();
  const [selected, setSelected] = useState<Student | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    classes.forEach((c) => m.set(c.id, c.name || c.id));
    return m;
  }, [classes]);

  const statsByStudent = useMemo(() => {
    const m = new Map<string, ReturnType<typeof summariseByStudent>[number]>();
    for (const s of summariseByStudent(results)) {
      if (s.studentId) m.set(s.studentId, s);
      m.set(s.studentName, s);
    }
    return m;
  }, [results]);

  const resultsFor = (student: Student): Result[] =>
    results.filter((r) => (student.id && r.studentId === student.id) || r.studentName === student.fullName);

  const flagStudent = async (student: Student, note: string) => {
    setError("");
    setStatus("");
    if (!schoolId || !currentUser) return;
    setFlagging(true);
    try {
      await addDoc(collection(db, "flags"), {
        schoolId,
        raisedBy: currentUser.uid,
        studentId: student.id || "",
        studentName: student.fullName || "",
        note: note || "",
        createdAt: serverTimestamp(),
      });
      setStatus(`Flagged ${student.fullName} for admin review.`);
      setSelected(null);
    } catch (e) {
      setError((e as Error).message || "Unable to flag student.");
    } finally {
      setFlagging(false);
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Students</h2>
        <p>Students in your assigned classes.</p>
      </div>

      {status ? <p className="muted-text">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="card table-card">
        <div className="section-heading">
          <h3>Class Students</h3>
          <p>{loading ? "Loading…" : `${students.length} student(s)`}</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Name</th><th>Class</th><th>Exams</th><th>Average</th><th>Last active</th><th>Trend</th><th>Action</th></tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const stat = statsByStudent.get(student.id) || statsByStudent.get(student.fullName || "");
                return (
                  <tr key={student.id} style={{ cursor: "pointer" }} onClick={() => setSelected(student)}>
                    <td>{student.fullName}</td>
                    <td>{classNameById.get(student.classId || "") || student.className || "—"}</td>
                    <td>{stat?.count ?? 0}</td>
                    <td>{stat ? `${stat.average}%` : "—"}</td>
                    <td>{stat ? timeAgo(stat.lastMs) : "never"}</td>
                    <td>{stat ? TREND_LABEL[stat.trend] : "—"}</td>
                    <td>
                      <button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); setSelected(student); }}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && students.length === 0 ? <p className="muted-text">No students in your assigned classes yet.</p> : null}
        </div>
      </div>

      {selected ? (
        <StudentDetailModal
          student={selected}
          results={resultsFor(selected)}
          flagging={flagging}
          onFlag={(note) => flagStudent(selected, note)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
