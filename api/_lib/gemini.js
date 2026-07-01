// Central Gemini (Google AI Studio) client: text generation + embeddings.
// Free tier, single GEMINI_API_KEY. Shared by the MCQ generator and the
// RAG study-assistant pipeline so we call the API one consistent way.

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_EMBED_MODEL = "text-embedding-004";
export const EMBED_DIMENSIONS = 768;
// Gemini caps batchEmbedContents at 100 requests per call.
const EMBED_BATCH_LIMIT = 100;

function resolveKey(apiKey) {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Add it to your .env (local) or hosting environment variables.",
    );
  }
  return key;
}

function resolveFetch(fetchImpl) {
  const fn = fetchImpl ?? globalThis.fetch;
  if (typeof fn !== "function") {
    throw new Error("No fetch implementation available in this runtime.");
  }
  return fn;
}

/**
 * Single text-generation call. Returns the concatenated text of the first
 * candidate. Throws on HTTP errors or non-STOP finish reasons.
 */
export async function generateContent({
  system,
  user,
  generationConfig = {},
  apiKey,
  model,
  fetchImpl,
} = {}) {
  const key = resolveKey(apiKey);
  const fetchFn = resolveFetch(fetchImpl);
  const usedModel = model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const url = `${BASE_URL}/${encodeURIComponent(usedModel)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gemini request failed (${response.status}). ${detail.slice(0, 300)}`.trim(),
    );
  }

  const payload = await response.json();
  const finishReason = payload?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini stopped early (reason: ${finishReason}).`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text;
}

/**
 * Embeds an array of texts, returning an array of number[] vectors in the
 * same order. Batches to respect Gemini's per-call limit.
 *
 * @param {string[]} texts
 * @param {object} [opts] - { taskType, apiKey, model, fetchImpl }
 *   taskType: "RETRIEVAL_DOCUMENT" for stored chunks, "RETRIEVAL_QUERY" for queries.
 */
export async function embedTexts(texts, opts = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }
  const key = resolveKey(opts.apiKey);
  const fetchFn = resolveFetch(opts.fetchImpl);
  const usedModel = opts.model ?? process.env.GEMINI_EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  const taskType = opts.taskType ?? "RETRIEVAL_DOCUMENT";
  const modelPath = `models/${usedModel}`;
  const url = `${BASE_URL}/${encodeURIComponent(usedModel)}:batchEmbedContents?key=${encodeURIComponent(key)}`;

  const vectors = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_LIMIT) {
    const batch = texts.slice(start, start + EMBED_BATCH_LIMIT);
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: modelPath,
          content: { parts: [{ text }] },
          taskType,
        })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Gemini embedding failed (${response.status}). ${detail.slice(0, 300)}`.trim(),
      );
    }

    const payload = await response.json();
    const embeddings = payload?.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error("Embedding response did not match the number of inputs.");
    }
    for (const embedding of embeddings) {
      const values = embedding?.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error("Received an empty embedding vector.");
      }
      vectors.push(values);
    }
  }

  return vectors;
}

/** Embeds a single string, returning one number[] vector. */
export async function embedText(text, opts = {}) {
  const [vector] = await embedTexts([text], opts);
  return vector;
}
