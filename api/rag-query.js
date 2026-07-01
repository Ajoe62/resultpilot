// POST /api/rag-query  (public — serves unauthenticated students)
// Body: { examId, question }
// Retrieval-augmented answer grounded in the study document linked to an
// active exam. Retrieval runs server-side via the Admin SDK, so students
// never receive raw embeddings and no security rules need loosening.

import { getDb } from "./_lib/firebaseAdmin.js";
import { resolveDocumentForExam, loadChunks } from "./_lib/ragStore.js";
import { embedText, generateContent } from "./_lib/gemini.js";
import { topK } from "./_lib/vectorMath.js";

const TOP_K = 5;
const MAX_QUESTION_LEN = 500;

const SYSTEM_PROMPT = [
  "You are a helpful study tutor for a specific course.",
  "Answer the student's question using ONLY the provided source excerpts.",
  "If the answer is not contained in the excerpts, say you don't have that information in the study material and suggest they rephrase or ask their teacher.",
  "Do not use outside knowledge or invent facts. Be clear and concise, and explain in a way a student can understand.",
].join("\n");

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    const examId = String(body.examId ?? "").trim();
    const question = String(body.question ?? "").trim();

    if (!examId) {
      res.status(400).json({ error: "examId is required." });
      return;
    }
    if (!question) {
      res.status(400).json({ error: "Please enter a question." });
      return;
    }
    if (question.length > MAX_QUESTION_LEN) {
      res.status(400).json({ error: "Your question is too long." });
      return;
    }

    const db = getDb();
    const meta = await resolveDocumentForExam(db, examId);
    if (!meta) {
      res.status(404).json({
        error: "No study material is available for this exam yet.",
      });
      return;
    }

    const chunks = await loadChunks(db, meta.id);
    if (chunks.length === 0) {
      res.status(404).json({ error: "The study material is empty." });
      return;
    }

    const queryVector = await embedText(question, { taskType: "RETRIEVAL_QUERY" });
    const matches = topK(queryVector, chunks, TOP_K);

    const context = matches
      .map((match, i) => `[Excerpt ${i + 1}]\n${match.text}`)
      .join("\n\n");

    const answer = await generateContent({
      system: SYSTEM_PROMPT,
      user: `SOURCE EXCERPTS:\n"""\n${context}\n"""\n\nSTUDENT QUESTION: ${question}`,
      generationConfig: { temperature: 0.2 },
    });

    res.status(200).json({
      answer,
      documentTitle: meta.title,
      sources: matches.map((match, i) => ({
        label: `Excerpt ${i + 1}`,
        snippet: match.text.slice(0, 240),
        score: Number(match.score.toFixed(3)),
      })),
    });
  } catch (error) {
    res.status(502).json({ error: error?.message || "Failed to answer the question." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
