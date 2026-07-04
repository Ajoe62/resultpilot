import { useMemo, useState } from "react";
import { useResults } from "../../hooks/useResults";
import { useExams } from "../../hooks/useExams";
import { summariseByExam, questionBreakdown } from "../../lib/analytics";
import { toCsv, downloadCsv } from "../../lib/csv";
import { timeAgo } from "../../hooks/util";
import type { Result } from "../../hooks/types";

type Sort = "recent" | "high" | "low";

export default function TutorResultList() {
  const { results, loading } = useResults();
  const { exams } = useExams();
  const [examId, setExamId] = useState("");
  const [passFilter, setPassFilter] = useState<"all" | "passed" | "failed">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [expanded, setExpanded] = useState<string>("");

  const filtered = useMemo(() => {
    let list = results.filter((r) => {
      if (examId && r.examId !== examId) return false;
      if (passFilter === "passed" && !r.passed) return false;
      if (passFilter === "failed" && r.passed) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "high") return (b.percentage ?? 0) - (a.percentage ?? 0);
      if (sort === "low") return (a.percentage ?? 0) - (b.percentage ?? 0);
      return (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0);
    });
    return list;
  }, [results, examId, passFilter, sort]);

  const perExam = useMemo(() => summariseByExam(filtered), [filtered]);

  const exportCsv = () => {
    const rows = filtered.map((r: Result) => ({
      student: r.studentName ?? "",
      admissionNumber: r.admissionNumber ?? "",
      class: r.class ?? "",
      subject: r.subject ?? "",
      exam: r.examTitle ?? "",
      score: r.score ?? "",
      total: r.total ?? "",
      percentage: r.percentage ?? "",
      passed: r.passed ? "Yes" : "No",
      submittedAt: r.submittedAtMs ? new Date(r.submittedAtMs).toISOString() : "",
    }));
    downloadCsv(`results-${Date.now()}`, toCsv(rows));
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Results</h2>
        <p>All submissions across your exams.</p>
      </div>

      <div className="button-row">
        <select value={examId} onChange={(e) => setExamId(e.target.value)}>
          <option value="">All exams</option>
          {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
        </select>
        <select value={passFilter} onChange={(e) => setPassFilter(e.target.value as typeof passFilter)}>
          <option value="all">All</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Most recent</option>
          <option value="high">Score high → low</option>
          <option value="low">Score low → high</option>
        </select>
        <button className="secondary-button" type="button" onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="card list-card">
        <div className="section-heading">
          <h3>Per-Exam Summary</h3>
          <p>{perExam.length} exam(s)</p>
        </div>
        <div className="stack-list">
          {perExam.map((s) => (
            <article className="stack-list__item" key={s.examId} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{s.examTitle}</strong>
                  <p className="muted-text">avg {s.average}% · {s.passCount} passed · {s.failCount} failed ({s.count} total)</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setExpanded(expanded === s.examId ? "" : s.examId)}
                >
                  {expanded === s.examId ? "Hide questions" : "Question breakdown"}
                </button>
              </div>
              {expanded === s.examId ? (
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Question</th><th>Answered</th><th>% wrong</th></tr></thead>
                    <tbody>
                      {questionBreakdown(filtered.filter((r) => r.examId === s.examId)).map((q, i) => (
                        <tr key={q.questionId}>
                          <td>Q{i + 1}</td>
                          <td>{q.answered}</td>
                          <td>{q.wrongRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="card table-card">
        <div className="section-heading">
          <h3>Submissions</h3>
          <p>{loading ? "Loading…" : `${filtered.length} result(s)`}</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Student</th><th>Exam</th><th>Score</th><th>%</th><th>Status</th><th>When</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.studentName}</td>
                  <td>{r.examTitle}</td>
                  <td>{r.score ?? "—"}/{r.total ?? "—"}</td>
                  <td>{r.percentage ?? 0}%</td>
                  <td>{r.passed ? "Passed" : "Failed"}</td>
                  <td>{timeAgo(r.submittedAtMs ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 ? <p className="muted-text">No results match these filters.</p> : null}
        </div>
      </div>
    </section>
  );
}
