// Text chunking for the RAG pipeline. Splits on paragraph/sentence
// boundaries where possible, with overlap so context isn't lost across cuts.

const DEFAULT_CHUNK_SIZE = 1000; // characters
const DEFAULT_OVERLAP = 150;

function normalizeWhitespace(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits text into overlapping chunks, preferring to break at paragraph or
 * sentence boundaries. Returns an array of trimmed, non-empty strings.
 */
export function chunkText(rawText, options = {}) {
  const size = options.size ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, Math.floor(size / 2));
  const text = normalizeWhitespace(rawText);

  if (!text) {
    return [];
  }
  if (text.length <= size) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      // Prefer a paragraph break, then a sentence end, then whitespace,
      // searching backwards within the latter part of the window.
      const window = text.slice(start, end);
      const floor = Math.floor(size * 0.5);
      const breakAt =
        lastBoundary(window, "\n\n", floor) ??
        lastBoundary(window, ". ", floor) ??
        lastBoundary(window, "\n", floor) ??
        lastBoundary(window, " ", floor);
      if (breakAt != null) {
        end = start + breakAt;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

// Returns the index just past the last occurrence of `marker` at or after
// `minIndex`, or null if none found.
function lastBoundary(window, marker, minIndex) {
  const idx = window.lastIndexOf(marker);
  if (idx >= minIndex) {
    return idx + marker.length;
  }
  return null;
}
