function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizeFilename(value) {
  return String(value || "result")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "result";
}

export function getResultGrade(percentage) {
  const score = Number(percentage);

  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

export function getResultRemark(percentage) {
  const score = Number(percentage);

  if (score >= 70) return "Excellent";
  if (score >= 60) return "Very Good";
  if (score >= 50) return "Good";
  if (score >= 45) return "Fair";
  if (score >= 40) return "Pass";
  return "Needs Improvement";
}

export function formatResultDate(result) {
  const rawDate = typeof result.submittedAt?.toDate === "function"
    ? result.submittedAt.toDate()
    : result.submittedAtMs
      ? new Date(result.submittedAtMs)
      : null;

  if (!rawDate || Number.isNaN(rawDate.getTime())) {
    return "Pending sync";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(rawDate);
}

export function buildResultSheetModel(result) {
  const percentage = Number(result.percentage || 0);

  return {
    title: "Student Assessment Result",
    school: result.school || "School",
    studentName: result.studentName || "Student",
    admissionNumber: result.admissionNumber || "-",
    className: result.class || "-",
    academicSession: result.academicSession || "Unspecified Session",
    term: result.term || "Unspecified Term",
    subject: result.subject || "-",
    examTitle: result.examTitle || "Assessment",
    score: Number(result.score || 0),
    total: Number(result.total || 0),
    percentage,
    grade: getResultGrade(percentage),
    remark: getResultRemark(percentage),
    status: result.passed ? "Passed" : "Failed",
    timeTaken: Number(result.timeTaken || 0),
    submittedAt: formatResultDate(result),
    resultId: result.id || "",
  };
}

export function buildResultFilename(result, extension) {
  const model = buildResultSheetModel(result);
  const base = sanitizeFilename(
    `${model.school}-${model.className}-${model.studentName}-${model.subject}`,
  );

  return `${base}.${extension}`;
}

export function buildResultSheetHtml(result) {
  const model = buildResultSheetModel(result);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.studentName)} Result</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
    }
    .sheet {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      border: 1px solid #d1d5db;
      padding: 28px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #111827;
      padding-bottom: 16px;
      margin-bottom: 22px;
    }
    .school {
      margin: 0;
      font-size: 26px;
      text-transform: uppercase;
    }
    .title {
      margin: 8px 0 0;
      font-size: 16px;
      color: #4b5563;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      margin-bottom: 22px;
      font-size: 14px;
    }
    .meta div {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
    }
    .meta span {
      display: block;
      color: #6b7280;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 22px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 10px;
      text-align: left;
      font-size: 14px;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 28px;
    }
    .summary div {
      border: 1px solid #d1d5db;
      padding: 12px;
      text-align: center;
    }
    .summary span {
      display: block;
      color: #6b7280;
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .summary strong {
      font-size: 18px;
    }
    .footer {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 40px;
      margin-top: 44px;
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
      <div><span>Student Name</span>${escapeHtml(model.studentName)}</div>
      <div><span>Admission Number</span>${escapeHtml(model.admissionNumber)}</div>
      <div><span>Class</span>${escapeHtml(model.className)}</div>
      <div><span>Date</span>${escapeHtml(model.submittedAt)}</div>
      <div><span>Session</span>${escapeHtml(model.academicSession)}</div>
      <div><span>Term</span>${escapeHtml(model.term)}</div>
      <div><span>Assessment</span>${escapeHtml(model.examTitle)}</div>
      <div><span>Result ID</span>${escapeHtml(model.resultId)}</div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Score</th>
          <th>Total</th>
          <th>Percentage</th>
          <th>Grade</th>
          <th>Remark</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(model.subject)}</td>
          <td>${escapeHtml(model.score)}</td>
          <td>${escapeHtml(model.total)}</td>
          <td>${escapeHtml(model.percentage)}%</td>
          <td>${escapeHtml(model.grade)}</td>
          <td>${escapeHtml(model.remark)}</td>
        </tr>
      </tbody>
    </table>

    <section class="summary">
      <div><span>Status</span><strong>${escapeHtml(model.status)}</strong></div>
      <div><span>Grade</span><strong>${escapeHtml(model.grade)}</strong></div>
      <div><span>Score</span><strong>${escapeHtml(model.score)}/${escapeHtml(model.total)}</strong></div>
      <div><span>Percentage</span><strong>${escapeHtml(model.percentage)}%</strong></div>
    </section>

    <section class="footer">
      <div class="signature">Class Teacher</div>
      <div class="signature">Principal / Director</div>
    </section>
  </main>
</body>
</html>`;
}
