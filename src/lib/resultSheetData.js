import {
  DEFAULT_ASSESSMENT_TYPE,
  getAssessmentMaxScore,
  normalizeAssessmentType,
} from "./assessmentTypes.js";

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
  const assessmentType = normalizeAssessmentType(
    result.assessmentType || DEFAULT_ASSESSMENT_TYPE,
  );
  const scaledScore = scaleResultScore(result, assessmentType);

  return buildTermResultSheetHtml(
    {
      ...result,
      className: result.className || result.class || "-",
    },
    [
      {
        subject: result.subject || "Unknown Subject",
        firstAssessment: assessmentType === "first_assessment" ? scaledScore : "",
        secondAssessment: assessmentType === "second_assessment" ? scaledScore : "",
        exam: assessmentType === "exam" ? scaledScore : "",
        totalScore: scaledScore,
      },
    ],
    {
      name: result.school,
    },
  );
}

export function buildTermResultSheetModel(
  studentData,
  subjectResults,
  schoolData = {},
  termNotes = "",
  attendance = {},
) {
  let totalScore = 0;
  let subjectCount = 0;

  const normalizeScore = (value) => {
    if (value === "" || value === null || value === undefined) return "";

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : "";
  };

  const subjects = subjectResults.map((subject) => {
    const subjectTotal = Number(subject.totalScore || 0);
    totalScore += subjectTotal;
    subjectCount += 1;

    return {
      name: subject.subject || "Unknown Subject",
      firstAssessment: normalizeScore(subject.firstAssessment),
      secondAssessment: normalizeScore(subject.secondAssessment),
      exam: normalizeScore(subject.exam),
      totalScore: subjectTotal,
    };
  });

  const overallGrade =
    subjectCount > 0 ? Math.round((totalScore / subjectCount) * 10) / 10 : 0;
  const overallGradeLettr = getResultGrade(overallGrade);

  return {
    school: schoolData.name || studentData.school || "School Name",
    schoolEmail:
      schoolData.email ||
      schoolData.contactEmail ||
      studentData.schoolEmail ||
      "apple@arethasageacademy.com",
    schoolPhone:
      schoolData.phone ||
      schoolData.contactPhone ||
      schoolData.address ||
      studentData.schoolPhone ||
      "For more information contact Ms. Apple at",
    studentName: studentData.studentName || "Student",
    admissionNumber: studentData.admissionNumber || "-",
    class: studentData.className || studentData.class || "-",
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
      daysOfSchool2: attendance.daysOfSchool2 || "",
      daysAttended2: attendance.daysAttended2 || "",
      daysAbsent2: attendance.daysAbsent2 || "",
    },
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
  const notesText =
    model.notes || "No teacher notes have been entered for this result sheet.";
  const subjectRows = model.subjects
    .map(
      (subject) => `
            <tr>
              <td class="subject-cell">${escapeHtml(subject.name)}</td>
              <td class="score-cell score-cell-blue">${escapeHtml(subject.firstAssessment)}</td>
              <td class="score-cell score-cell-blue">${escapeHtml(subject.secondAssessment)}</td>
              <td class="score-cell score-cell-yellow">${escapeHtml(subject.exam)}</td>
              <td class="score-cell score-cell-yellow">${escapeHtml(subject.totalScore)}</td>
            </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.studentName)} - Term Result Sheet</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html { background: #e5e7eb; }
    body {
      margin: 0;
      color: #141a24;
      font-family: Arial, Helvetica, sans-serif;
      background: #e5e7eb;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      border: 7px solid #f4f5f7;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
    }
    .header {
      height: 42mm;
      background: #142866;
      color: #ffffff;
      padding: 13mm 12mm 9mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-left h1 {
      margin: 0;
      color: #ffd94a;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 31px;
      line-height: 1.05;
      font-weight: 700;
      letter-spacing: 0;
    }
    .header-left p {
      margin: 7px 0 0;
      color: #ffffff;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 24px;
      line-height: 1;
      font-weight: 700;
    }
    .header-right {
      width: 225px;
      padding-top: 1mm;
      color: #ffffff;
      font-size: 9px;
      line-height: 1.25;
      text-align: left;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 17px;
    }
    .school-mark {
      position: relative;
      display: inline-block;
      width: 25px;
      height: 24px;
      border-bottom: 3px solid #ffd94a;
      flex: 0 0 auto;
    }
    .school-mark::before {
      content: "";
      position: absolute;
      left: 2px;
      top: 0;
      width: 21px;
      height: 0;
      border-left: 10.5px solid transparent;
      border-right: 10.5px solid transparent;
      border-bottom: 6px solid #ffd94a;
    }
    .school-mark::after {
      content: "";
      position: absolute;
      left: 5px;
      top: 8px;
      width: 15px;
      height: 10px;
      border-left: 3px solid #ffd94a;
      border-right: 3px solid #ffd94a;
      background: linear-gradient(90deg, transparent 0 4px, #ffd94a 4px 6px, transparent 6px 9px, #ffd94a 9px 11px, transparent 11px);
    }
    .brand-name {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .contact-copy {
      margin: 0;
      font-size: 8px;
      font-weight: 700;
      text-align: center;
    }
    .contact-email {
      margin: 1px 0 0;
      color: #ffd94a;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }
    .content { padding: 9mm 11mm 12mm; }
    .student-info-table,
    .results-table,
    .attendance-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .student-info-table { margin: 0 0 8mm; }
    .student-info-table th,
    .student-info-table td {
      border: 1px solid #8c929d;
      height: 36px;
      padding: 9px 10px;
      font-size: 11px;
      line-height: 1.15;
      vertical-align: middle;
      text-align: left;
    }
    .student-info-table th {
      width: 25%;
      color: #ffffff;
      background: #142866;
      font-size: 13px;
      font-weight: 700;
    }
    .student-info-table td {
      width: 25%;
      background: #ffffff;
      font-weight: 400;
    }
    .results-table { margin: 0 0 5px; }
    .results-table th,
    .results-table td {
      border: 1px solid #7e88a2;
      padding: 6px 9px;
      font-size: 11px;
      line-height: 1.2;
      height: 27px;
      text-align: left;
      vertical-align: top;
    }
    .results-table th {
      height: 68px;
      font-size: 13px;
      font-weight: 700;
    }
    .subject-heading {
      width: 27%;
      color: #ffffff;
      background: #142866;
    }
    .first-heading,
    .second-heading {
      width: 16%;
      color: #000000;
      background: #5389f3;
    }
    .exam-heading {
      width: 16%;
      color: #000000;
      background: #ffd84d;
    }
    .total-heading {
      width: 23%;
      color: #000000;
      background: #ffd84d;
    }
    .subject-cell { background: #ffffff; color: #1f2937; }
    .score-cell { font-weight: 400; text-align: left; }
    .score-cell-blue { background: #c9e4f4; }
    .score-cell-yellow { background: #fbf1ce; }
    .middle-grid {
      display: grid;
      grid-template-columns: 58% 38%;
      gap: 4%;
      align-items: stretch;
      margin-top: 5px;
    }
    .attendance-table th,
    .attendance-table td {
      border: 1px solid #7e88a2;
      height: 31px;
      padding: 7px 9px;
      font-size: 11px;
      line-height: 1.2;
      text-align: left;
    }
    .attendance-table th {
      color: #ffffff;
      background: #142866;
      font-size: 13px;
      font-weight: 700;
    }
    .attendance-table th:nth-child(2) {
      color: #000000;
      background: #5389f3;
    }
    .attendance-table th:nth-child(3) {
      color: #000000;
      background: #ffd84d;
    }
    .attendance-table td:nth-child(2) { background: #c9e4f4; }
    .attendance-table td:nth-child(3) { background: #fbf1ce; }
    .overall-card {
      background: #c9e4f4;
      min-height: 120px;
      padding: 23px 21px;
    }
    .grade-label {
      margin: 0 0 7px;
      color: #1f2937;
      font-size: 16px;
      font-weight: 400;
      text-transform: uppercase;
    }
    .grade-value {
      margin: 0;
      color: #142866;
      font-size: 25px;
      line-height: 1;
      font-weight: 700;
    }
    .previous-grade {
      margin: 8px 0 0;
      color: #1f2937;
      font-size: 11px;
    }
    .bottom-grid {
      display: grid;
      grid-template-columns: 57% 38%;
      gap: 5%;
      align-items: stretch;
      margin-top: 31px;
    }
    .notes-card,
    .grading-card {
      min-height: 180px;
      padding: 23px 20px;
    }
    .notes-card { background: #c9e4f4; }
    .grading-card { background: #fbf1ce; }
    .notes-card h3,
    .grading-card h3 {
      margin: 0 0 17px;
      color: #1f2937;
      font-size: 11px;
      font-weight: 700;
    }
    .notes-card p,
    .grading-card p {
      margin: 0;
      color: #1f2937;
      font-size: 11px;
      line-height: 1.25;
    }
    @media print {
      html,
      body {
        width: 210mm;
        min-height: 297mm;
        background: #ffffff;
      }
      .sheet {
        margin: 0;
        border: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <div class="header-left">
        <h1>${escapeHtml(model.school)}</h1>
        <p>Result Sheet</p>
      </div>
      <div class="header-right">
        <div class="brand-row">
          <span class="school-mark" aria-hidden="true"></span>
          <span class="brand-name">${escapeHtml(model.school)}</span>
        </div>
        <p class="contact-copy">${escapeHtml(model.schoolPhone)}</p>
        <p class="contact-email">${escapeHtml(model.schoolEmail)}</p>
      </div>
    </section>

    <section class="content">
      <table class="student-info-table" aria-label="Student details">
        <tbody>
          <tr>
            <th>Name of Student:</th>
            <td><strong>${escapeHtml(model.studentName)}</strong></td>
            <th>Term :</th>
            <td>${escapeHtml(model.term)}</td>
          </tr>
          <tr>
            <th>Section:</th>
            <td>${escapeHtml(model.section)}</td>
            <th>School Year:</th>
            <td>${escapeHtml(model.schoolYear)}</td>
          </tr>
        </tbody>
      </table>

      <table class="results-table">
        <thead>
          <tr>
            <th class="subject-heading">SUBJECT</th>
            <th class="first-heading">First Assessment<br>(20%)</th>
            <th class="second-heading">Second Assessment<br>(20%)</th>
            <th class="exam-heading">Exam (60%)</th>
            <th class="total-heading">Total (100%)</th>
          </tr>
        </thead>
        <tbody>
${subjectRows}
        </tbody>
      </table>

      <section class="middle-grid">
        <table class="attendance-table" aria-label="Attendance">
          <thead>
            <tr>
              <th>ATTENDANCE</th>
              <th>SEMESTER 1</th>
              <th>SEMESTER 2</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Days of school</td>
              <td>${escapeHtml(model.attendance.daysOfSchool)}</td>
              <td>${escapeHtml(model.attendance.daysOfSchool2)}</td>
            </tr>
            <tr>
              <td>Days attended</td>
              <td>${escapeHtml(model.attendance.daysAttended)}</td>
              <td>${escapeHtml(model.attendance.daysAttended2)}</td>
            </tr>
            <tr>
              <td>Days absent</td>
              <td>${escapeHtml(model.attendance.daysAbsent)}</td>
              <td>${escapeHtml(model.attendance.daysAbsent2)}</td>
            </tr>
          </tbody>
        </table>
        <div class="overall-card">
          <p class="grade-label">OVERALL GRADE</p>
          <p class="grade-value">${escapeHtml(model.overallGrade)}</p>
          <p class="previous-grade">Grade: <strong>${escapeHtml(model.overallGradeLetter)}</strong></p>
        </div>
      </section>

      <section class="bottom-grid">
        <div class="notes-card">
          <h3>Notes:</h3>
          <p>${escapeHtml(notesText)}</p>
        </div>
        <div class="grading-card">
          <h3>Grading system:</h3>
          <p>A+ 95-100 | A 91-94 | A- 85-90<br>
          B+ 81-84 | B 77-80 | B- 74-79<br>
          C+ 70-73 | C 66-69 | C- 60-65<br>
          D 51-59<br>
          F &gt;50</p>
        </div>
      </section>
    </section>
  </main>
</body>
</html>`;
}

function buildLegacyTermResultSheetHtml(
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

function roundScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function scaleResultScore(result, assessmentType) {
  const normalizedType = normalizeAssessmentType(
    assessmentType || result.assessmentType || DEFAULT_ASSESSMENT_TYPE,
  );
  const maxScore = Number(
    result.assessmentMaxScore || getAssessmentMaxScore(normalizedType),
  );
  const score = Number(result.score || 0);
  const total = Number(result.total || 0);

  if (total > 0) {
    return roundScore((score / total) * maxScore);
  }

  return roundScore(Math.min(score, maxScore));
}

export function consolidateResultsBySubject(results) {
  const latestBySubjectAndType = new Map();
  const subjectMap = new Map();

  for (const result of results) {
    const subject = result.subject || "Unknown Subject";
    const assessmentType = normalizeAssessmentType(
      result.assessmentType || DEFAULT_ASSESSMENT_TYPE,
    );
    const key = `${String(subject).trim().toUpperCase()}__${assessmentType}`;
    const current = latestBySubjectAndType.get(key);
    const currentTime = Number(current?.submittedAtMs || 0);
    const nextTime = Number(result.submittedAtMs || 0);

    if (!current || nextTime >= currentTime) {
      latestBySubjectAndType.set(key, {
        ...result,
        subject,
        assessmentType,
      });
    }
  }

  for (const result of latestBySubjectAndType.values()) {
    const subject = result.subject || "Unknown Subject";
    const assessmentType = normalizeAssessmentType(
      result.assessmentType || DEFAULT_ASSESSMENT_TYPE,
    );

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
    const scaledScore = scaleResultScore(result, assessmentType);

    if (assessmentType === "first_assessment") {
      subjectData.first_assessment = scaledScore;
    } else if (assessmentType === "second_assessment") {
      subjectData.second_assessment = scaledScore;
    } else if (assessmentType === "exam") {
      subjectData.exam = scaledScore;
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
