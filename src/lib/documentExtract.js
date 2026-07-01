// Client-side text extraction for study-document uploads. Runs in the browser
// so large files never hit the serverless request-size/time limits — only the
// extracted text is sent to the ingest API. Parsers are lazy-loaded.

const PDF_TYPES = ["application/pdf"];
const DOCX_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md";

function hasExtension(name, ext) {
  return name.toLowerCase().endsWith(ext);
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str ?? "").join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}

async function extractDocx(file) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

/**
 * Extracts plain text from a PDF, DOCX, TXT, or Markdown file.
 * Throws for unsupported types.
 */
export async function extractText(file) {
  if (!file) {
    throw new Error("No file selected.");
  }
  const name = file.name || "";

  if (PDF_TYPES.includes(file.type) || hasExtension(name, ".pdf")) {
    return extractPdf(file);
  }
  if (DOCX_TYPES.includes(file.type) || hasExtension(name, ".docx")) {
    return extractDocx(file);
  }
  if (
    file.type.startsWith("text/") ||
    hasExtension(name, ".txt") ||
    hasExtension(name, ".md")
  ) {
    return file.text();
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT, or Markdown file.");
}
