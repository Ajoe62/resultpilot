import {
  ASSESSMENT_TYPES,
  DEFAULT_ASSESSMENT_TYPE,
  getAssessmentLabel,
  getAssessmentMaxScore,
  normalizeAssessmentType,
} from "./assessmentTypes.js";
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

function roundScore(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatScore(value) {
  const rounded = roundScore(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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

function getManualScoreKey(score) {
  return [
    score.studentId || score.studentName || "unknown-student",
    score.schoolId || score.school || "unknown-school",
    score.classId || score.class || "unknown-class",
    score.academicSession || "Unspecified Session",
    score.term || "Unspecified Term",
  ].join("__");
}

function getSubjectKey(value) {
  return String(value || "Unknown Subject").trim().toUpperCase();
}

function chooseLatestAutomated(results) {
  const bySubjectAndType = new Map();

  for (const result of results) {
    const subject = result.subject || "Unknown Subject";
    const assessmentType = normalizeAssessmentType(
      result.assessmentType || DEFAULT_ASSESSMENT_TYPE,
    );
    const key = `${getSubjectKey(subject)}__${assessmentType}`;
    const current = bySubjectAndType.get(key);
    const currentTime = Number(current?.submittedAtMs || 0);
    const nextTime = Number(result.submittedAtMs || 0);

    if (!current || nextTime >= currentTime) {
      bySubjectAndType.set(key, {
        ...result,
        subject,
        assessmentType,
        assessmentMaxScore: Number(
          result.assessmentMaxScore || getAssessmentMaxScore(assessmentType),
        ),
      });
    }
  }

  return [...bySubjectAndType.values()];
}

export function getMatchingTermResults(sourceResult, results) {
  const sourceKey = getTermKey(sourceResult);
  return results.filter((result) => getTermKey(result) === sourceKey);
}

export function getMatchingManualScores(sourceResult, manualScores = []) {
  const sourceKey = getTermKey(sourceResult);
  return manualScores.filter((score) => getManualScoreKey(score) === sourceKey);
}

export function buildTermResultModel(sourceResult, allResults, manualScores = []) {
  const matchingResults = getMatchingTermResults(sourceResult, allResults);
  const matchingManualScores = getMatchingManualScores(sourceResult, manualScores);
  const automatedResults = chooseLatestAutomated(matchingResults);
  const first =
    automatedResults[0] ||
    matchingManualScores[0] ||
    matchingResults[0] ||
    sourceResult;
  const subjectNames = new Map();

  for (const result of automatedResults) {
    subjectNames.set(getSubjectKey(result.subject), result.subject || "Unknown Subject");
  }

  for (const score of matchingManualScores) {
    subjectNames.set(getSubjectKey(score.subject), score.subject || "Unknown Subject");
  }

  const subjects = [...subjectNames.entries()]
    .map(([subjectKey, subject]) => {
      const assessments = ASSESSMENT_TYPES.map((type) => {
        const automated = automatedResults.find(
          (result) =>
            getSubjectKey(result.subject) === subjectKey &&
            result.assessmentType === type.value,
        );
        const manualTotal = matchingManualScores
          .filter(
            (score) =>
              getSubjectKey(score.subject) === subjectKey &&
              normalizeAssessmentType(score.assessmentType) === type.value,
          )
          .reduce((sum, score) => sum + Number(score.score || 0), 0);
        const maxScore = type.maxScore;
        const automatedScore = automated?.total
          ? (Number(automated.score || 0) / Number(automated.total || 1)) * maxScore
          : 0;
        const finalScore = Math.min(maxScore, automatedScore + manualTotal);

        return {
          type: type.value,
          label: type.label,
          maxScore,
          automatedScore: roundScore(automatedScore),
          manualScore: roundScore(manualTotal),
          score: roundScore(finalScore),
          hasScore: Boolean(automated) || manualTotal > 0,
        };
      });
      const totalScore = roundScore(
        assessments.reduce((sum, assessment) => sum + assessment.score, 0),
      );
      const totalPossible = assessments.reduce(
        (sum, assessment) => sum + assessment.maxScore,
        0,
      );
      const percentage = totalPossible
        ? Math.round((totalScore / totalPossible) * 100)
        : 0;

      return {
        subject,
        assessments,
        firstAssessment: assessments[0],
        secondAssessment: assessments[1],
        exam: assessments[2],
        totalScore,
        totalPossible,
        percentage,
        grade: getResultGrade(percentage),
        remark: getResultRemark(percentage),
      };
    })
    .sort((firstSubject, secondSubject) =>
      firstSubject.subject.localeCompare(secondSubject.subject),
    );

  const totalScore = roundScore(
    subjects.reduce((sum, subject) => sum + subject.totalScore, 0),
  );
  const totalPossible = subjects.reduce(
    (sum, subject) => sum + subject.totalPossible,
    0,
  );
  const average = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;

  return {
    title: "Full Term Result Sheet",
    school: first.school || "School",
    schoolId: first.schoolId || "",
    studentName: first.studentName || "Student",
    studentId: first.studentId || "",
    admissionNumber: first.admissionNumber || "-",
    className: first.class || first.className || "-",
    classId: first.classId || "",
    academicSession: first.academicSession || "Unspecified Session",
    term: first.term || "Unspecified Term",
    subjectCount: subjects.length,
    totalScore,
    totalPossible,
    average,
    grade: getResultGrade(average),
    remark: getResultRemark(average),
    status: average >= 40 ? "Passed" : "Failed",
    subjects,
  };
}

export function buildTermResultFilename(sourceResult, extension) {
  const base = sanitizeFilename(
    `${sourceResult.school || "School"}-${sourceResult.class || sourceResult.className || "Class"}-${sourceResult.studentName || "Student"}-${sourceResult.academicSession || "Session"}-${sourceResult.term || "Term"}`,
  );

  return `${base}.${extension}`;
}

export function buildTermResultSheetHtml(sourceResult, allResults, manualScores = []) {
  const model = buildTermResultModel(sourceResult, allResults, manualScores);
  const subjectRows = model.subjects.map((subject) => `
        <tr>
          <td>${escapeHtml(subject.subject)}</td>
          <td>${subject.firstAssessment.hasScore ? escapeHtml(formatScore(subject.firstAssessment.score)) : "-"}</td>
          <td>${subject.secondAssessment.hasScore ? escapeHtml(formatScore(subject.secondAssessment.score)) : "-"}</td>
          <td>${subject.exam.hasScore ? escapeHtml(formatScore(subject.exam.score)) : "-"}</td>
          <td>${escapeHtml(formatScore(subject.totalScore))}/${escapeHtml(subject.totalPossible)}</td>
          <td>${escapeHtml(subject.percentage)}%</td>
          <td>${escapeHtml(subject.remark)}</td>
        </tr>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.studentName)} Term Result</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #071057;
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
    }
    .sheet {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      border: 1px solid #d9defa;
      overflow: hidden;
      background: #ffffff;
    }
    .header {
      padding: 28px 30px 24px;
      color: #ffffff;
      background: #071057;
      position: relative;
    }
    .header:after {
      content: "";
      position: absolute;
      right: -70px;
      bottom: -80px;
      width: 260px;
      height: 180px;
      background: #58a300;
      border-radius: 80px 0 0 0;
    }
    .brand {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
    }
    .school {
      margin: 0;
      font-size: 27px;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .title {
      margin: 8px 0 0;
      color: #a8f04c;
      font-size: 16px;
      font-weight: 700;
    }
    .badge {
      background: #ffffff;
      color: #ff3434;
      border-radius: 999px;
      min-width: 88px;
      min-height: 88px;
      display: grid;
      place-items: center;
      text-align: center;
      font-size: 22px;
      font-weight: 800;
    }
    .content {
      padding: 24px 30px 30px;
      background: linear-gradient(180deg, #ffffff 0%, #f6f8ff 100%);
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
      background: #ffffff;
      border: 1px solid #d9defa;
      border-radius: 8px;
      padding: 10px;
      min-height: 56px;
    }
    .meta span,
    .summary span {
      display: block;
      color: #4a55a8;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .summary strong {
      color: #071057;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 22px;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      border: 1px solid #d9defa;
      padding: 9px;
      text-align: left;
      font-size: 12px;
    }
    th {
      background: #071057;
      color: #ffffff;
      font-weight: 800;
    }
    tbody tr:nth-child(even) td {
      background: #f1f4ff;
    }
    .note {
      color: #4a55a8;
      font-size: 11px;
      margin: -10px 0 20px;
    }
    .footer {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 44px;
      margin-top: 42px;
      font-size: 13px;
    }
    .signature {
      border-top: 2px solid #071057;
      padding-top: 8px;
      text-align: center;
      color: #071057;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <div class="brand">
        <div>
          <h1 class="school">${escapeHtml(model.school)}</h1>
          <p class="title">${escapeHtml(model.title)}</p>
        </div>
        <div class="badge">${escapeHtml(model.average)}%</div>
      </div>
    </section>

    <section class="content">
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
            <th>${escapeHtml(getAssessmentLabel("first_assessment"))} / 20</th>
            <th>${escapeHtml(getAssessmentLabel("second_assessment"))} / 20</th>
            <th>${escapeHtml(getAssessmentLabel("exam"))} / 60</th>
            <th>Total / 100</th>
            <th>%</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
${subjectRows || `        <tr><td colspan="7">No subject results available.</td></tr>`}
        </tbody>
      </table>
      <p class="note">Manual scores are added to automated scores and capped at each assessment maximum.</p>

      <section class="summary">
        <div><span>Total Score</span><strong>${escapeHtml(formatScore(model.totalScore))}/${escapeHtml(model.totalPossible)}</strong></div>
        <div><span>Average</span><strong>${escapeHtml(model.average)}%</strong></div>
        <div><span>Grade</span><strong>${escapeHtml(model.grade)}</strong></div>
        <div><span>Overall Remark</span><strong>${escapeHtml(model.remark)}</strong></div>
      </section>

      <section class="footer">
        <div class="signature">Class Teacher</div>
        <div class="signature">Principal / Director</div>
      </section>
    </section>
  </main>
</body>
</html>`;
}
