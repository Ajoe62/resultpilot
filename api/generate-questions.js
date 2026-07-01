// Vercel/Netlify serverless function: POST /api/generate-questions
// Keeps GEMINI_API_KEY server-side. Body: { subject, topic, difficulty, count }.
// Returns: { questions: [{ questionText, options[4], correctAnswer }] }.

import { generateQuestions, GenerationInputError } from "./_lib/generateQuestions.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  // Vercel parses JSON bodies automatically; fall back for other runtimes.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      res.status(400).json({ error: "Request body must be valid JSON." });
      return;
    }
  }

  try {
    const questions = await generateQuestions(body ?? {});
    res.status(200).json({ questions });
  } catch (error) {
    if (error instanceof GenerationInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(502).json({
      error: error?.message || "Failed to generate questions.",
    });
  }
}
