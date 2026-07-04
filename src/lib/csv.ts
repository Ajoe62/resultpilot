// Tiny CSV builder + browser download (no dependency). Values are quoted and
// internal quotes doubled per RFC 4180.

function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: ReadonlyArray<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) return headers ? headers.join(",") : "";
  const cols = headers ?? Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
