import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useExams } from "../../hooks/useExams";
import { useResults } from "../../hooks/useResults";
import { useTutors } from "../../hooks/useTutors";
import {
  atRiskStudents,
  averagePercentage,
  distinctStudents,
  passRate,
  summariseBySubject,
} from "../../lib/analytics";
import { rollupByTutor } from "../../lib/tutorStats";
import FlaggedStudents from "../../components/admin/FlaggedStudents";

function short(text: string, n = 12): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// School-wide oversight for the proprietor: KPIs, tutor comparison, weakest
// subjects, at-risk students (any class), and the flag review inbox.
export default function AdminSchoolAnalytics() {
  const { exams, loading: examsLoading } = useExams();
  const { results, loading: resultsLoading } = useResults();
  const { tutors } = useTutors();

  const tutorRows = useMemo(() => rollupByTutor(exams, results, tutors), [exams, results, tutors]);
  const tutorChart = useMemo(
    () => tutorRows.filter((t) => t.submissions > 0).map((t) => ({ name: short(t.name), passRate: t.passRate })),
    [tutorRows],
  );
  const subjects = useMemo(() => [...summariseBySubject(results)].sort((a, b) => a.average - b.average), [results]);
  const atRisk = useMemo(() => atRiskStudents(results), [results]);

  const loading = examsLoading || resultsLoading;

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>School Analytics</h2>
        <p>School-wide performance across every tutor and class.</p>
      </div>

      <div className="admin-grid">
        <div className="card"><h3>School Pass Rate</h3><p className="muted-text">{loading ? "…" : `${passRate(results)}%`}</p></div>
        <div className="card"><h3>Average Score</h3><p className="muted-text">{loading ? "…" : `${averagePercentage(results)}%`}</p></div>
        <div className="card"><h3>Exams</h3><p className="muted-text">{exams.length}</p></div>
        <div className="card"><h3>Students Assessed</h3><p className="muted-text">{distinctStudents(results)}</p></div>
      </div>

      <div className="card">
        <h3>Tutor Comparison — Pass Rate</h3>
        {tutorChart.length === 0 ? (
          <p className="muted-text">No tutor submissions yet.</p>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={tutorChart} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip />
                <Bar dataKey="passRate" fill="#2563eb" name="Pass %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Tutor</th><th>Exams</th><th>Submissions</th><th>Avg %</th><th>Pass rate</th></tr></thead>
            <tbody>
              {tutorRows.map((t) => (
                <tr key={t.uid}>
                  <td>{t.name}</td>
                  <td>{t.examsCreated}</td>
                  <td>{t.submissions}</td>
                  <td>{t.averagePercentage}%</td>
                  <td>{t.passRate}%</td>
                </tr>
              ))}
              {tutorRows.length === 0 ? <tr><td colSpan={5} className="muted-text">No tutors yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Weakest Subjects</h3>
        {subjects.length === 0 ? (
          <p className="muted-text">No results yet.</p>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={subjects} margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip />
                <Bar dataKey="average" fill="#d97706" name="Avg %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card table-card">
        <div className="section-heading"><h3>At-Risk Students</h3><p>2+ consecutive fails · {atRisk.length}</p></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Student</th><th>Exams</th><th>Average</th><th>Consecutive fails</th></tr></thead>
            <tbody>
              {atRisk.map((s) => (
                <tr key={s.key} style={{ color: "#b91c1c" }}>
                  <td>{s.studentName}</td>
                  <td>{s.count}</td>
                  <td>{s.average}%</td>
                  <td>{s.consecutiveFails}</td>
                </tr>
              ))}
              {atRisk.length === 0 ? <tr><td colSpan={4} className="muted-text">No at-risk students.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <FlaggedStudents />
    </section>
  );
}
