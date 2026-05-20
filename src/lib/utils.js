export function shuffleArray(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimeTaken(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getScoreMessage(percentage) {
  if (percentage >= 80) return "Excellent! Keep building.";
  if (percentage >= 60) return "Strong effort. You're on track.";
  if (percentage >= 40) return "Keep practicing. You're improving.";
  return "More revision will help. Try again.";
}

export function formatDateValue(value) {
  if (!value) return "Pending sync";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function buildCsv(rows) {
  const escapeCell = (value) => {
    const normalized = value == null ? "" : String(value);
    const escaped = normalized.replaceAll('"', '""');
    return `"${escaped}"`;
  };

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadTextFile(filename, text, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function normalizeText(value) {
  return value.trim().toLowerCase();
}
