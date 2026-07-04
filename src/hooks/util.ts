// Firestore timestamps come back as Timestamp objects (or serverTimestamp
// sentinels mid-write). Normalize to epoch millis for client-side sorting.
export function toMillis(value: unknown): number {
  if (!value) return 0;
  const candidate = value as { toMillis?: () => number; seconds?: number };
  if (typeof candidate.toMillis === "function") return candidate.toMillis();
  if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

// Compact relative-time label from epoch millis (or 0 => "never").
export function timeAgo(ms: number): string {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
