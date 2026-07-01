// POST /api/generate-from-document  (admin only)
// Body: { documentId, difficulty, count, topic? }
// Generates MCQs grounded ONLY in an uploaded document's text, so a tutor's
// source drives the questions instead of generic knowledge.

import { requireAdmin, AuthError } from "./_lib/requireAdmin.js";
import { getDb } from "./_lib/firebaseAdmin.js";
import { getDocumentMeta, loadText } from "./_lib/ragStore.js";
import { generateQuestions, GenerationInputError } from "./_lib/generateQuestions.js";

// Cap the source fed to the model to keep latency and token use reasonable.
const MAX_SOURCE_CHARS = 40000;

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

    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) {
      res.status(400).json({ error: "A documentId is required." });
      return;
    }

    const db = getDb();
    const meta = await getDocumentMeta(db, documentId);
    if (!meta) {
      res.status(404).json({ error: "Study document not found." });
      return;
    }

    const sourceText = await loadText(db, documentId, MAX_SOURCE_CHARS);
    if (!sourceText) {
      res.status(400).json({ error: "The document has no stored text to draw from." });
      return;
    }

    const questions = await generateQuestions({
      sourceText,
      subject: meta.subject,
      topic: String(body.topic ?? "").trim(),
      difficulty: body.difficulty,
      count: body.count,
    });

    res.status(200).json({ questions, documentTitle: meta.title });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof GenerationInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: error?.message || "Failed to generate questions." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
