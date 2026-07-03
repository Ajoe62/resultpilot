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
