import {
  getResultGrade,
  getResultRemark,
  sanitizeFilename,
} from "./resultSheetData.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTermKey(result) {
  return [
    result.studentId || result.studentName || "unknown-student",
    result.schoolId || result.school || "unknown-school",
    result.classId || result.class || "unknown-class",
    result.academicSession || "Unspecified Session",
    result.term || "Unspecified Term",
  ].join("__");
}

export function getMatchingTermResults(sourceResult, results) {
  const sourceKey = getTermKey(sourceResult);
  return results.filter((result) => getTermKey(result) === sourceKey);
}

function chooseLatestSubjectResults(results) {
  const bySubject = new Map();

  for (const result of results) {
    const subject = result.subject || "Unknown Subject";
    const current = bySubject.get(subject);
    const currentTime = Number(current?.submittedAtMs || 0);
    const nextTime = Number(result.submittedAtMs || 0);

    if (!current || nextTime >= currentTime) {
      bySubject.set(subject, result);
    }
  }

  return [...bySubject.values()].sort((first, second) =>
    String(first.subject || "").localeCompare(String(second.subject || "")),
  );
}

export function buildTermResultModel(sourceResult, allResults) {
  const subjectResults = chooseLatestSubjectResults(
    getMatchingTermResults(sourceResult, allResults),
  );
  const first = subjectResults[0] || sourceResult;
  const totalScore = subjectResults.reduce(
    (sum, result) => sum + Number(result.score || 0),
    0,
  );
  const totalPossible = subjectResults.reduce(
    (sum, result) => sum + Number(result.total || 0),
    0,
  );
  const average = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;
  const grade = getResultGrade(average);

  return {
    title: "Term Result Sheet",
    school: first.school || "School",
    studentName: first.studentName || "Student",
    admissionNumber: first.admissionNumber || "-",
    className: first.class || "-",
    academicSession: first.academicSession || "Unspecified Session",
    term: first.term || "Unspecified Term",
    subjectCount: subjectResults.length,
    totalScore,
    totalPossible,
    average,
    grade,
    remark: getResultRemark(average),
    status: average >= 40 ? "Passed" : "Failed",
    subjects: subjectResults.map((result) => {
      const percentage = Number(result.percentage || 0);

      return {
        subject: result.subject || "Unknown Subject",
        examTitle: result.examTitle || "Assessment",
        score: Number(result.score || 0),
        total: Number(result.total || 0),
        percentage,
        grade: getResultGrade(percentage),
        remark: getResultRemark(percentage),
      };
    }),
  };
}

export function buildTermResultFilename(sourceResult, extension) {
  const base = sanitizeFilename(
    `${sourceResult.school || "School"}-${sourceResult.class || "Class"}-${sourceResult.studentName || "Student"}-${sourceResult.academicSession || "Session"}-${sourceResult.term || "Term"}`,
  );

  return `${base}.${extension}`;
}

export function buildTermResultSheetHtml(sourceResult, allResults) {
  const model = buildTermResultModel(sourceResult, allResults);
  const subjectRows = model.subjects.map((subject) => `
        <tr>
          <td>${escapeHtml(subject.subject)}</td>
          <td>${escapeHtml(subject.examTitle)}</td>
          <td>${escapeHtml(subject.score)}</td>
          <td>${escapeHtml(subject.total)}</td>
          <td>${escapeHtml(subject.percentage)}%</td>
          <td>${escapeHtml(subject.grade)}</td>
          <td>${escapeHtml(subject.remark)}</td>
        </tr>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.studentName)} Term Result</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
    }
    .sheet {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #d1d5db;
      padding: 26px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #111827;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .school {
      margin: 0;
      font-size: 25px;
      text-transform: uppercase;
    }
    .title {
      margin: 8px 0 0;
      color: #4b5563;
      font-size: 15px;
    }
    .meta,
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .meta div,
    .summary div {
      border: 1px solid #d1d5db;
      padding: 10px;
    }
    .meta span,
    .summary span {
      display: block;
      color: #6b7280;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .summary strong {
      font-size: 17px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 9px;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .footer {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 44px;
      margin-top: 42px;
      font-size: 13px;
    }
    .signature {
      border-top: 1px solid #111827;
      padding-top: 8px;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <h1 class="school">${escapeHtml(model.school)}</h1>
      <p class="title">${escapeHtml(model.title)}</p>
    </section>

    <section class="meta">
      <div><span>Student</span>${escapeHtml(model.studentName)}</div>
      <div><span>Admission No.</span>${escapeHtml(model.admissionNumber)}</div>
      <div><span>Class</span>${escapeHtml(model.className)}</div>
      <div><span>Subjects</span>${escapeHtml(model.subjectCount)}</div>
      <div><span>Session</span>${escapeHtml(model.academicSession)}</div>
      <div><span>Term</span>${escapeHtml(model.term)}</div>
      <div><span>Status</span>${escapeHtml(model.status)}</div>
      <div><span>Remark</span>${escapeHtml(model.remark)}</div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Assessment</th>
          <th>Score</th>
          <th>Total</th>
          <th>%</th>
          <th>Grade</th>
          <th>Remark</th>
        </tr>
      </thead>
      <tbody>
${subjectRows || `        <tr><td colspan="7">No subject results available.</td></tr>`}
      </tbody>
    </table>

    <section class="summary">
      <div><span>Total Score</span><strong>${escapeHtml(model.totalScore)}/${escapeHtml(model.totalPossible)}</strong></div>
      <div><span>Average</span><strong>${escapeHtml(model.average)}%</strong></div>
      <div><span>Grade</span><strong>${escapeHtml(model.grade)}</strong></div>
      <div><span>Overall Remark</span><strong>${escapeHtml(model.remark)}</strong></div>
    </section>

    <section class="footer">
      <div class="signature">Class Teacher</div>
      <div class="signature">Principal / Director</div>
    </section>
  </main>
</body>
</html>`;
}
