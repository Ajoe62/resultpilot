import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useResults } from "../../hooks/useResults";
import {
  atRiskStudents,
  bottomStudents,
  summariseByExam,
  summariseBySubject,
  topStudents,
} from "../../lib/analytics";
import type { StudentSummary } from "../../lib/analytics";

function StudentTable({ title, rows, danger }: { title: string; rows: StudentSummary[]; danger?: boolean }) {
  return (
    <div className="card table-card">
      <div className="section-heading"><h3>{title}</h3><p>{rows.length}</p></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Student</th><th>Exams</th><th>Average</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key} style={danger ? { color: "#b91c1c" } : undefined}>
                <td>{s.studentName}</td>
                <td>{s.count}</td>
                <td>{s.average}%</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={3} className="muted-text">No data yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TutorAnalytics() {
  const { results, loading } = useResults();

  const examTrend = useMemo(
    () =>
      summariseByExam(results)
        .slice(-10)
        .map((s) => ({
          name: s.examTitle.length > 14 ? `${s.examTitle.slice(0, 14)}…` : s.examTitle,
          average: s.average,
          passRate: s.count ? Math.round((s.passCount / s.count) * 100) : 0,
        })),
    [results],
  );
  const subjectData = useMemo(() => summariseBySubject(results), [results]);
  const top = useMemo(() => topStudents(results, 5), [results]);
  const bottom = useMemo(() => bottomStudents(results, 5), [results]);
  const atRisk = useMemo(() => atRiskStudents(results), [results]);

  if (loading) return <section className="admin-section"><p className="muted-text">Loading analytics…</p></section>;

  if (results.length === 0) {
    return (
      <section className="admin-section">
        <div className="section-heading"><h2>Analytics</h2><p>No submissions yet — charts appear once students sit your exams.</p></div>
      </section>
    );
  }

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Analytics</h2>
        <p>Performance trends across your exams.</p>
      </div>

      <div className="card">
        <h3>Class Average — Last 10 Exams</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={examTrend} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="average" stroke="#2563eb" strokeWidth={2} name="Avg %" />
              <Line type="monotone" dataKey="passRate" stroke="#16a34a" strokeWidth={2} name="Pass %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Average Score by Subject</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={subjectData} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="subject" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip />
              <Bar dataKey="average" fill="#2563eb" name="Avg %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="admin-grid">
        <StudentTable title="Top 5 Students" rows={top} />
        <StudentTable title="Needs Attention (Bottom 5)" rows={bottom} />
      </div>

      <StudentTable title="At Risk — 2+ consecutive fails" rows={atRisk} danger />
    </section>
  );
}
