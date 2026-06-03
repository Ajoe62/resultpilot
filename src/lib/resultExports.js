import {
  buildResultFilename,
  buildResultSheetHtml,
  buildTermResultSheetHtml,
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

export function downloadResultDoc(result) {
  const html = buildResultSheetHtml(result);
  const blob = new Blob([html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildResultFilename(result, "doc");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  const blob = new Blob([html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildTermResultFilename(sourceResult, "doc");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
