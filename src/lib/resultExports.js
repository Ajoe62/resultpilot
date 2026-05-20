import {
  buildResultFilename,
  buildResultSheetHtml,
} from "./resultSheetData";
import {
  buildTermResultFilename,
  buildTermResultSheetHtml,
} from "./termResultData";

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
  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    throw new Error("Allow popups to open the printable result sheet.");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 250);
}

export function downloadTermResultDoc(sourceResult, allResults) {
  const html = buildTermResultSheetHtml(sourceResult, allResults);
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

export function printTermResultPdf(sourceResult, allResults) {
  const html = buildTermResultSheetHtml(sourceResult, allResults);
  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    throw new Error("Allow popups to open the printable term result sheet.");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 250);
}
