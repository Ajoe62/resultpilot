import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import {
  exportResultsToGoogleSheets,
  hasGoogleSheetsConfig,
} from "../../lib/googleSheets";
import {
  downloadTermResultDoc,
  downloadResultDoc,
  printTermResultPdf,
  printResultPdf,
} from "../../lib/resultExports";
import {
  buildCsv,
  downloadTextFile,
  formatDateValue,
  normalizeText,
} from "../../lib/utils";

export default function ResultsDashboardPage() {
  const [results, setResults] = useState([]);
  const [exportingSheets, setExportingSheets] = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState("");
  const [resultExportStatus, setResultExportStatus] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    subject: "All",
    academicSession: "All",
    term: "All",
    school: "",
    fromDate: "",
    toDate: "",
  });

  const deferredSearch = useDeferredValue(filters.search);
  const academicSessions = useMemo(
    () => [
      "All",
      ...new Set(results.map((result) => result.academicSession).filter(Boolean)),
    ],
    [results],
  );
  const terms = useMemo(
    () => [
      "All",
      ...new Set(results.map((result) => result.term).filter(Boolean)),
    ],
    [results],
  );

  useEffect(() => {
    const resultsQuery = query(
      collection(db, "results"),
      orderBy("submittedAt", "desc"),
    );
    const unsubscribe = onSnapshot(resultsQuery, (snapshot) => {
      setResults(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })),
      );
    });

    return unsubscribe;
  }, []);

  const filteredResults = results.filter((result) => {
    const matchesSearch = normalizeText(result.studentName || "").includes(
      normalizeText(deferredSearch),
    );
    const matchesSubject =
      filters.subject === "All" || result.subject === filters.subject;
    const matchesAcademicSession =
      filters.academicSession === "All" ||
      result.academicSession === filters.academicSession;
    const matchesTerm = filters.term === "All" || result.term === filters.term;
    const matchesSchool = normalizeText(result.school || "").includes(
      normalizeText(filters.school),
    );

    const submittedDate =
      typeof result.submittedAt?.toDate === "function"
        ? result.submittedAt.toDate()
        : null;

    const matchesFrom =
      !filters.fromDate ||
      (submittedDate && submittedDate >= new Date(filters.fromDate));
    const matchesTo =
      !filters.toDate ||
      (submittedDate &&
        submittedDate <= new Date(`${filters.toDate}T23:59:59`));

    return (
      matchesSearch &&
      matchesSubject &&
      matchesAcademicSession &&
      matchesTerm &&
      matchesSchool &&
      matchesFrom &&
      matchesTo
    );
  });

  const exportCsv = () => {
    const rows = [
      [
        "Name",
        "Admission Number",
        "School",
        "School ID",
        "Class",
        "Class ID",
        "Student ID",
        "Subject",
        "Academic Session",
        "Term",
        "Score",
        "Percentage",
        "Time Taken (s)",
        "Passed",
        "Date",
      ],
      ...filteredResults.map((result) => [
        result.studentName,
        result.admissionNumber,
        result.school,
        result.schoolId,
        result.class,
        result.classId,
        result.studentId,
        result.subject,
        result.academicSession,
        result.term,
        `${result.score}/${result.total}`,
        `${result.percentage}%`,
        result.timeTaken,
        result.passed ? "Yes" : "No",
        formatDateValue(result.submittedAt),
      ]),
    ];

    downloadTextFile("resultpilot-results.csv", buildCsv(rows), "text/csv");
  };

  const exportSheets = async () => {
    setSheetsStatus("");
    setExportingSheets(true);

    try {
      const response = await exportResultsToGoogleSheets(filteredResults);
      setSheetsStatus(
        `Exported ${response.rowCount} rows across ${response.groupCount} sheet tabs.`,
      );
      window.open(response.spreadsheetUrl, "_blank", "noopener,noreferrer");
    } catch (exportError) {
      setSheetsStatus(exportError.message || "Google Sheets export failed.");
    } finally {
      setExportingSheets(false);
    }
  };

  const handlePrintPdf = (result) => {
    setResultExportStatus("");

    try {
      printResultPdf(result);
    } catch (exportError) {
      setResultExportStatus(exportError.message || "Unable to open PDF print view.");
    }
  };

  const handleDownloadDoc = (result) => {
    setResultExportStatus("");

    try {
      downloadResultDoc(result);
    } catch (exportError) {
      setResultExportStatus(exportError.message || "Unable to download DOC result.");
    }
  };

  const handlePrintTermPdf = (result) => {
    setResultExportStatus("");

    try {
      printTermResultPdf(result, results);
    } catch (exportError) {
      setResultExportStatus(exportError.message || "Unable to open complete result print view.");
    }
  };

  const handleDownloadTermDoc = (result) => {
    setResultExportStatus("");

    try {
      downloadTermResultDoc(result, results);
    } catch (exportError) {
      setResultExportStatus(exportError.message || "Unable to download complete DOC result.");
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Results Dashboard</h2>
        <p>Search, filter, and export student performance data.</p>
      </div>

      <div className="card filters-card">
        <div className="field-grid">
          <label className="field">
            <span>Search Student</span>
            <input
              value={filters.search}
              onChange={(event) =>
                startTransition(() =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  })),
                )
              }
              placeholder="Search by name"
            />
          </label>

          <label className="field">
            <span>Subject</span>
            <select
              value={filters.subject}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  subject: event.target.value,
                }))
              }
            >
              {["All", "HTML", "CSS", "JavaScript"].map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Academic Session</span>
            <select
              value={filters.academicSession}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  academicSession: event.target.value,
                }))
              }
            >
              {academicSessions.map((academicSession) => (
                <option key={academicSession} value={academicSession}>
                  {academicSession}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Term</span>
            <select
              value={filters.term}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  term: event.target.value,
                }))
              }
            >
              {terms.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>School</span>
            <input
              value={filters.school}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  school: event.target.value,
                }))
              }
              placeholder="Filter by school"
            />
          </label>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  fromDate: event.target.value,
                }))
              }
            />
          </label>

          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  toDate: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="field-grid">
          <div className="field actions-field">
            <span>Export</span>
            <div className="button-row">
              <button className="secondary-button" onClick={exportCsv} type="button">
                Export CSV
              </button>
              <button
                className="primary-button"
                disabled={exportingSheets || !hasGoogleSheetsConfig()}
                onClick={exportSheets}
                type="button"
              >
                {exportingSheets ? "Exporting..." : "Export to Sheets"}
              </button>
            </div>
          </div>
        </div>
        {!hasGoogleSheetsConfig() ? (
          <p className="muted-text">
            Add Google Sheets environment values to enable direct Sheets export.
          </p>
        ) : null}
        {sheetsStatus ? <p className="muted-text">{sheetsStatus}</p> : null}
        {resultExportStatus ? <p className="form-error">{resultExportStatus}</p> : null}
      </div>

      <div className="card table-card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Admission No.</th>
                <th>School</th>
                <th>Class</th>
                <th>Session</th>
                <th>Term</th>
                <th>Subject</th>
                <th>Score</th>
                <th>%</th>
                <th>Time</th>
                <th>Date</th>
                <th>Result Sheet</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((result) => (
                <tr key={result.id}>
                  <td>{result.studentName}</td>
                  <td>{result.admissionNumber || "-"}</td>
                  <td>{result.school}</td>
                  <td>{result.class}</td>
                  <td>{result.academicSession || "-"}</td>
                  <td>{result.term || "-"}</td>
                  <td>{result.subject}</td>
                  <td>
                    {result.score}/{result.total}
                  </td>
                  <td>{result.percentage}%</td>
                  <td>{result.timeTaken}s</td>
                  <td>{formatDateValue(result.submittedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="secondary-button"
                        onClick={() => handlePrintPdf(result)}
                        type="button"
                      >
                        PDF
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => handleDownloadDoc(result)}
                        type="button"
                      >
                        DOC
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => handlePrintTermPdf(result)}
                        type="button"
                      >
                        Full PDF
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => handleDownloadTermDoc(result)}
                        type="button"
                      >
                        Full DOC
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredResults.length ? (
            <p className="muted-text">No results match the current filters.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
