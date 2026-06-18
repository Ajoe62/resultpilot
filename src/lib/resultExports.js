import {
  buildResultFilename,
  buildResultSheetHtml,
  buildTermResultSheetHtml,
  sanitizeFilename,
} from "./resultSheetData";
import {
  buildTermResultFilename,
  buildTermResultModel,
} from "./termResultData";

function getScoreValue(assessment) {
  return assessment?.hasScore ? assessment.score : "";
}

function buildTemplateSubjects(sourceResult, allResults, manualScores) {
  return buildTermResultModel(sourceResult, allResults, manualScores).subjects.map(
    (subject) => ({
      subject: subject.subject,
      firstAssessment: getScoreValue(subject.firstAssessment),
      secondAssessment: getScoreValue(subject.secondAssessment),
      exam: getScoreValue(subject.exam),
      totalScore: subject.totalScore,
    }),
  );
}

function openPrintableResultSheet(html, errorMessage) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error(errorMessage);
  }

  const printableHtml = html.replace(
    "</body>",
    `<script>
      window.addEventListener("load", () => {
        window.setTimeout(() => {
          window.focus();
          window.print();
        }, 350);
      });
    </script></body>`,
  );

  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();
}

function downloadWordHtml(filename, html) {
  const blob = new Blob([html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getHtmlPart(html, pattern, fallback = "") {
  return html.match(pattern)?.[1] || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBulkResultFilename(firstSourceResult) {
  const base = sanitizeFilename(
    `${firstSourceResult.school || "School"}-${firstSourceResult.academicSession || "Session"}-${firstSourceResult.term || "Term"}-all-students-results`,
  );

  return `${base}.doc`;
}

function assertResultSheets(resultSheets) {
  if (!resultSheets.length) {
    throw new Error("There are no student results to download.");
  }
}

function buildCombinedTermResultsHtml(resultSheets) {
  const renderedSheets = resultSheets.map((sheet) =>
    buildTermResultSheetHtml(
      sheet.sourceResult,
      buildTemplateSubjects(sheet.sourceResult, sheet.allResults, sheet.manualScores),
      sheet.schoolData,
      sheet.termNotes,
      sheet.attendance,
    ),
  );
  const firstHtml = renderedSheets[0];
  const title = `${resultSheets[0].sourceResult.school || "School"} - All Student Results`;
  const style = getHtmlPart(firstHtml, /<style>([\s\S]*?)<\/style>/i);
  const sheets = renderedSheets
    .map((html) => getHtmlPart(html, /<body[^>]*>([\s\S]*?)<\/body>/i, html))
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
${style}
    body { padding-bottom: 12mm; }
    .sheet { margin: 0 auto 12mm; }
    @media print {
      body { width: auto; min-height: auto; }
      .sheet { margin: 0 auto; page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
${sheets}
</body>
</html>`;
}

export function downloadResultDoc(result) {
  const html = buildResultSheetHtml(result);
  downloadWordHtml(buildResultFilename(result, "doc"), html);
}

export function printResultPdf(result) {
  const html = buildResultSheetHtml(result);
  openPrintableResultSheet(
    html,
    "Allow popups to open the printable result sheet.",
  );
}

export function downloadTermResultDoc(
  sourceResult,
  allResults,
  schoolData = {},
  termNotes = "",
  attendance = {},
  manualScores = [],
) {
  const html = buildTermResultSheetHtml(
    sourceResult,
    buildTemplateSubjects(sourceResult, allResults, manualScores),
    schoolData,
    termNotes,
    attendance,
  );
  downloadWordHtml(buildTermResultFilename(sourceResult, "doc"), html);
}

export function downloadAllTermResultsDoc(resultSheets) {
  assertResultSheets(resultSheets);

  downloadWordHtml(
    buildBulkResultFilename(resultSheets[0].sourceResult),
    buildCombinedTermResultsHtml(resultSheets),
  );
}

export function printAllTermResultsPdf(resultSheets) {
  assertResultSheets(resultSheets);

  openPrintableResultSheet(
    buildCombinedTermResultsHtml(resultSheets),
    "Allow popups to open the printable all-students result sheet.",
  );
}

export function printTermResultPdf(
  sourceResult,
  allResults,
  schoolData = {},
  termNotes = "",
  attendance = {},
  manualScores = [],
) {
  const html = buildTermResultSheetHtml(
    sourceResult,
    buildTemplateSubjects(sourceResult, allResults, manualScores),
    schoolData,
    termNotes,
    attendance,
  );
  openPrintableResultSheet(
    html,
    "Allow popups to open the printable term result sheet.",
  );
}
