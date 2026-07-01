// Framework-agnostic core for the AI MCQ generation engine.
// Used by both the Vercel serverless handler (api/generate-questions.js)
// and the Vite dev-server middleware (vite.config.js) so the same logic
// runs locally and in production.

export const MAX_COUNT = 20;
export const MIN_COUNT = 1;
export const DIFFICULTIES = ["easy", "medium", "hard"];
export const ANSWER_LETTERS = ["A", "B", "C", "D"];
export const DEFAULT_MODEL = "gemini-2.5-flash";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini structured-output schema (OpenAPI subset). Guarantees the model
// returns a JSON array of MCQ objects in the exact shape Firestore expects.
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      questionText: { type: "STRING" },
      options: {
        type: "ARRAY",
        items: { type: "STRING" },
        minItems: 4,
        maxItems: 4,
      },
      correctAnswer: { type: "STRING", enum: ANSWER_LETTERS },
    },
    required: ["questionText", "options", "correctAnswer"],
    propertyOrdering: ["questionText", "options", "correctAnswer"],
  },
};

const SYSTEM_INSTRUCTION = [
  "You are an expert exam author who writes high-quality multiple-choice questions (MCQs).",
  "Follow these rules strictly:",
  "- Produce exactly the requested number of questions.",
  "- Each question has exactly four answer options.",
  "- Exactly one option is correct. 'correctAnswer' is the letter (A, B, C, or D) of the correct option, where A is the first option, B the second, and so on.",
  "- Distractors (wrong options) must be plausible and relevant but unambiguously incorrect to a knowledgeable reader.",
  "- All four options within a question must be distinct.",
  "- Match the requested difficulty level.",
  "- Each question must be self-contained and clear. Do not use options like 'All of the above' or 'None of the above'.",
  "- Do not number the questions or add commentary. Return only data that conforms to the response schema.",
].join("\n");

// Raised for bad caller input (HTTP 400) vs. upstream/model failures (HTTP 502).
export class GenerationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "GenerationInputError";
  }
}

export function validateGenerationParams(raw = {}) {
  const subject = String(raw.subject ?? "").trim();
  const topic = String(raw.topic ?? "").trim();
  const difficulty = String(raw.difficulty ?? "").trim().toLowerCase();
  const count = Number(raw.count);

  if (!subject) {
    throw new GenerationInputError("Subject is required.");
  }
  if (!topic) {
    throw new GenerationInputError("Topic is required.");
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new GenerationInputError(
      `Difficulty must be one of: ${DIFFICULTIES.join(", ")}.`,
    );
  }
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new GenerationInputError(
      `Count must be a whole number between ${MIN_COUNT} and ${MAX_COUNT}.`,
    );
  }

  return { subject, topic, difficulty, count };
}

// Mirrors the validation rules enforced in ManageQuestionsPage so a saved
// AI question is always a valid manual question too.
function normalizeQuestion(item, index) {
  const questionText = String(item?.questionText ?? "").trim();
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option ?? "").trim())
    : [];
  const correctAnswer = String(item?.correctAnswer ?? "").trim().toUpperCase();

  const position = index + 1;

  if (!questionText) {
    throw new Error(`Generated question ${position} is missing question text.`);
  }
  if (options.length !== 4 || options.some((option) => !option)) {
    throw new Error(`Generated question ${position} must have four non-empty options.`);
  }
  if (new Set(options).size !== options.length) {
    throw new Error(`Generated question ${position} has duplicate options.`);
  }
  if (!ANSWER_LETTERS.includes(correctAnswer)) {
    throw new Error(`Generated question ${position} has an invalid correct answer.`);
  }

  return { questionText, options, correctAnswer };
}

function buildUserPrompt({ subject, topic, difficulty, count }) {
  return [
    `Subject: ${subject}`,
    `Topic: ${topic}`,
    `Difficulty: ${difficulty}`,
    `Number of questions: ${count}`,
  ].join("\n");
}

/**
 * Calls Gemini and returns a validated array of MCQ objects:
 * { questionText, options: [4], correctAnswer: "A"|"B"|"C"|"D" }.
 *
 * @param {object} params - { subject, topic, difficulty, count }
 * @param {object} [config] - { apiKey, model, fetchImpl }
 */
export async function generateQuestions(params, config = {}) {
  const clean = validateGenerationParams(params);
  const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
  const model = config.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Add it to your .env (local) or hosting environment variables.",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available in this runtime.");
  }

  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPrompt(clean) }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gemini request failed (${response.status}). ${detail.slice(0, 300)}`.trim(),
    );
  }

  const payload = await response.json();

  const finishReason = payload?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error(
      `Gemini stopped before finishing (reason: ${finishReason}). Try fewer questions or a different topic.`,
    );
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Could not parse the model response as JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The model did not return any questions.");
  }

  return parsed.map(normalizeQuestion);
}
