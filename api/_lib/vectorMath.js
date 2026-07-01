// Vector similarity helpers for brute-force retrieval over Firestore-stored
// embeddings. Fine at school scale (hundreds–low thousands of chunks).

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return -1;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) {
    return -1;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Ranks items by cosine similarity to queryVector and returns the top k.
 *
 * @param {number[]} queryVector
 * @param {Array<{ embedding: number[] }>} items
 * @param {number} k
 * @returns {Array<item & { score: number }>}
 */
export function topK(queryVector, items, k = 5) {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryVector, item.embedding) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, k));
}
