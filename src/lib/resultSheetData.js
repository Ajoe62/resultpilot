function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizeFilename(value) {
  return (
    String(value || "result")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "result"
  );
}

export function getResultGrade(percentage) {
  const score = Number(percentage);

  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function getResultRemark(percentage) {
  const score = Number(percentage);

  if (score >= 70) return "Excellent";
  if (score >= 60) return "Very Good";
  if (score >= 50) return "Good";
  if (score >= 40) return "Pass";
  return "Fail";
}

export function formatResultDate(result) {
  const rawDate =
    typeof result.submittedAt?.toDate === "function"
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

export function buildTermResultSheetModel(
  studentData,
  subjectResults,
  schoolData = {},
  termNotes = "",
  attendance = {},
) {
  // Calculate overall grade as average of all subjects' total scores
  let totalScore = 0;
  let subjectCount = 0;

  const subjects = subjectResults.map((subject) => {
    const subjectTotal = Number(subject.totalScore || 0);
    totalScore += subjectTotal;
    subjectCount += 1;

    return {
      name: subject.subject || "Unknown Subject",
      firstAssessment: Number(subject.firstAssessment || 0),
      secondAssessment: Number(subject.secondAssessment || 0),
      exam: Number(subject.exam || 0),
      totalScore: subjectTotal,
    };
  });

  const overallGrade =
    subjectCount > 0 ? Math.round((totalScore / subjectCount) * 10) / 10 : 0;
  const overallGradeLettr = getResultGrade(overallGrade);

  return {
    school: schoolData.name || "School Name",
    schoolEmail: schoolData.email || "info@school.edu",
    schoolPhone: schoolData.phone || "+1 (555) 000-0000",
    studentName: studentData.studentName || "Student",
    admissionNumber: studentData.admissionNumber || "-",
    section: studentData.className || "-",
    term: studentData.term || "Unspecified Term",
    schoolYear: studentData.academicSession || "Unspecified Session",
    subjects,
    overallGrade,
    overallGradeLetter: overallGradeLettr,
    notes: termNotes || "",
    attendance: {
      daysOfSchool: attendance.daysOfSchool || 0,
      daysAttended: attendance.daysAttended || 0,
      daysAbsent: attendance.daysAbsent || 0,
    },
    hasAttendance: Boolean(attendance.daysOfSchool),
  };
}

export function buildTermResultSheetHtml(
  studentData,
  subjectResults,
  schoolData = {},
  termNotes = "",
  attendance = {},
) {
  const model = buildTermResultSheetModel(
    studentData,
    subjectResults,
    schoolData,
    termNotes,
    attendance,
  );

  const subjectRows = model.subjects
    .map(
      (subject) => `
    <tr>
      <td style="padding: 12px 8px;">${escapeHtml(subject.name)}</td>
      <td style="padding: 12px 8px; text-align: center; background-color: #6366f1; color: white;">${escapeHtml(subject.firstAssessment)}</td>
      <td style="padding: 12px 8px; text-align: center; background-color: #60a5fa; color: white;">${escapeHtml(subject.secondAssessment)}</td>
      <td style="padding: 12px 8px; text-align: center; background-color: #fbbf24; color: #1f2937;">${escapeHtml(subject.exam)}</td>
      <td style="padding: 12px 8px; text-align: center; background-color: #fcd34d; color: #1f2937; font-weight: bold;">${escapeHtml(subject.totalScore)}</td>
    </tr>
  `,
    )
    .join("");

  const attendanceSection = model.hasAttendance
    ? `
    <section style="margin-top: 28px; margin-bottom: 28px;">
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr>
            <th style="padding: 10px; text-align: left; background-color: #001f3f; color: white; border: 1px solid #d1d5db;">ATTENDANCE</th>
            <th style="padding: 10px; text-align: center; background-color: #4f46e5; color: white; border: 1px solid #d1d5db;">TERM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db;">Days of school</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #d1d5db;">${escapeHtml(model.attendance.daysOfSchool)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db;">Days attended</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #d1d5db;">${escapeHtml(model.attendance.daysAttended)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db;">Days absent</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #d1d5db;">${escapeHtml(model.attendance.daysAbsent)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `
    : "";

  const notesSection = model.notes
    ? `
    <section style="margin-top: 28px; margin-bottom: 28px; display: grid; grid-template-columns: 1fr; gap: 20px;">
      <div style="background-color: #e0e7ff; padding: 16px; border-radius: 4px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">Notes:</h3>
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #374151;">${escapeHtml(model.notes)}</p>
      </div>
    </section>
  `
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.studentName)} - Term Result Sheet</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2937;
      font-family: 'Arial', sans-serif;
      background: #ffffff;
    }
    .sheet {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #001f3f 0%, #0a3f7b 100%);
      color: white;
      padding: 20px;
      text-align: center;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left h1 {
      margin: 0;
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .header-right {
      text-align: right;
      font-size: 13px;
    }
    .header-right p {
      margin: 2px 0;
    }
    .student-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 20px;
      background-color: #f9fafb;
      border-bottom: 2px solid #001f3f;
    }
    .info-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .info-label {
      font-weight: 700;
      color: #001f3f;
      background-color: white;
      padding: 6px 10px;
      border: 1px solid #001f3f;
      min-width: 140px;
    }
    .info-value {
      padding: 6px 10px;
      border: 1px solid #d1d5db;
      border-left: none;
      flex: 1;
      background-color: white;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .results-table thead tr th {
      background-color: #001f3f;
      color: white;
      padding: 12px 8px;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      border: 1px solid #001f3f;
    }
    .results-table tbody tr td {
      border: 1px solid #d1d5db;
      padding: 10px 8px;
      font-size: 13px;
    }
    .grade-section {
      padding: 20px;
      background-color: #e0e7ff;
      border-radius: 4px;
      margin: 20px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      align-items: center;
    }
    .grade-box {
      background-color: white;
      padding: 16px;
      border-radius: 4px;
      text-align: center;
      border: 2px solid #4f46e5;
    }
    .grade-label {
      font-size: 13px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .grade-value {
      font-size: 28px;
      font-weight: bold;
      color: #001f3f;
    }
    .grading-system {
      background-color: #fef3c7;
      padding: 16px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .grading-system h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 700;
      color: #001f3f;
    }
    .grading-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      font-size: 12px;
    }
    .grade-item {
      background-color: white;
      padding: 8px;
      border-radius: 2px;
      text-align: center;
      border: 1px solid #d1d5db;
    }
    .footer {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 40px;
      margin-top: 40px;
      padding: 0 20px;
      font-size: 13px;
    }
    .signature {
      border-top: 1px solid #1f2937;
      padding-top: 10px;
      text-align: center;
      min-height: 40px;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <div class="header-left">
        <h1>${escapeHtml(model.school)}</h1>
        <p style="margin: 4px 0 0 0; font-size: 14px;">Result Sheet</p>
      </div>
      <div class="header-right">
        <p><strong>📍 ${escapeHtml(model.schoolPhone)}</strong></p>
        <p>${escapeHtml(model.schoolEmail)}</p>
      </div>
    </section>

    <section class="student-info">
      <div class="info-block">
        <span class="info-label">Name of Student:</span>
        <span class="info-value">${escapeHtml(model.studentName)}</span>
      </div>
      <div class="info-block">
        <span class="info-label">Term:</span>
        <span class="info-value">${escapeHtml(model.term)}</span>
      </div>
      <div class="info-block">
        <span class="info-label">Section:</span>
        <span class="info-value">${escapeHtml(model.section)}</span>
      </div>
      <div class="info-block">
        <span class="info-label">School Year:</span>
        <span class="info-value">${escapeHtml(model.schoolYear)}</span>
      </div>
    </section>

    <section style="padding: 0 20px;">
      <table class="results-table">
        <thead>
          <tr>
            <th style="text-align: left;">SUBJECT</th>
            <th>First Assessment (20%)</th>
            <th>Second Assessment (20%)</th>
            <th>Exam (60%)</th>
            <th>Total (100%)</th>
          </tr>
        </thead>
        <tbody>
          ${subjectRows}
        </tbody>
      </table>

      ${attendanceSection}

      <section class="grade-section">
        <div></div>
        <div class="grade-box">
          <div class="grade-label">OVERALL GRADE</div>
          <div class="grade-value">${escapeHtml(model.overallGrade)}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Grade: ${escapeHtml(model.overallGradeLetter)}</div>
        </div>
      </section>

      ${notesSection}

      <section class="grading-system">
        <h3>Grading system:</h3>
        <div class="grading-grid">
          <div class="grade-item"><strong>A</strong><br>95-100 | A: 91-94</div>
          <div class="grade-item"><strong>B</strong><br>81-84 | B: 77-80</div>
          <div class="grade-item"><strong>C</strong><br>70-73 | C: 66-69</div>
          <div class="grade-item"><strong>D</strong><br>51-59</div>
          <div class="grade-item"><strong>F</strong><br>50</div>
        </div>
      </section>

      <section class="footer">
        <div class="signature">Class Teacher Signature</div>
        <div class="signature">Principal / Director Signature</div>
      </section>
    </section>
  </main>
</body>
</html>`;
}

export function consolidateResultsBySubject(results) {
  const subjectMap = new Map();

  for (const result of results) {
    const subject = result.subject || "Unknown Subject";
    const assessmentType = result.assessmentType || "exam";

    if (!subjectMap.has(subject)) {
      subjectMap.set(subject, {
        subject,
        first_assessment: 0,
        second_assessment: 0,
        exam: 0,
        totalScore: 0,
      });
    }

    const subjectData = subjectMap.get(subject);

    if (assessmentType === "first_assessment") {
      subjectData.first_assessment = Number(result.score || 0);
    } else if (assessmentType === "second_assessment") {
      subjectData.second_assessment = Number(result.score || 0);
    } else if (assessmentType === "exam") {
      subjectData.exam = Number(result.score || 0);
    }

    subjectData.totalScore =
      subjectData.first_assessment +
      subjectData.second_assessment +
      subjectData.exam;
  }

  return [...subjectMap.values()].sort((a, b) =>
    a.subject.localeCompare(b.subject),
  );
}

export function getSubjectResultsByTermKey(
  results,
  studentId,
  schoolId,
  classId,
  academicSession,
  term,
) {
  const filtered = results.filter(
    (r) =>
      r.studentId === studentId &&
      r.schoolId === schoolId &&
      r.classId === classId &&
      r.academicSession === academicSession &&
      r.term === term,
  );

  return consolidateResultsBySubject(filtered);
}
