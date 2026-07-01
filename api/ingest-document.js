// POST /api/ingest-document  (admin only)
// Body: { title, subject?, examId?, text }
// Chunks the extracted text, embeds each chunk, and stores the vectors in
// Firestore. Text is extracted client-side, so we only receive plain text.

import { requireAdmin, AuthError } from "./_lib/requireAdmin.js";
import { getDb } from "./_lib/firebaseAdmin.js";
import { chunkText } from "./_lib/chunk.js";
import { embedTexts } from "./_lib/gemini.js";
import { storeDocument } from "./_lib/ragStore.js";

// Bound cost/time on the free tier. ~1000 chunks * ~1000 chars ≈ a sizeable
// textbook; larger uploads are truncated with a flag so the admin knows.
const MAX_CHUNKS = 1000;

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    await requireAdmin(req);

    const title = String(body.title ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const examId = String(body.examId ?? "").trim();
    const text = String(body.text ?? "");

    if (!title) {
      res.status(400).json({ error: "A document title is required." });
      return;
    }
    if (text.trim().length < 40) {
      res.status(400).json({
        error: "The document has too little extractable text to be useful.",
      });
      return;
    }

    let chunks = chunkText(text);
    if (chunks.length === 0) {
      res.status(400).json({ error: "No usable text could be extracted." });
      return;
    }

    const truncated = chunks.length > MAX_CHUNKS;
    if (truncated) {
      chunks = chunks.slice(0, MAX_CHUNKS);
    }

    const embeddings = await embedTexts(chunks, { taskType: "RETRIEVAL_DOCUMENT" });
    const db = getDb();
    const result = await storeDocument(
      db,
      { title, subject, examId, source: "upload" },
      chunks,
      embeddings,
    );

    res.status(200).json({
      documentId: result.id,
      chunkCount: result.chunkCount,
      charCount: result.charCount,
      truncated,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: error?.message || "Failed to ingest document." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
