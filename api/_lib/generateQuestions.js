// Core for the AI MCQ generation engine. Two modes:
//   - topic mode:  generate from subject + topic (Upgrade 1).
//   - source mode: generate ONLY from provided source text (Upgrade 2, RAG),
//                  so a tutor's uploaded document drives the questions.
// Shared by the serverless handlers and the Vite dev middleware.

import { generateContent } from "./gemini.js";

export const MAX_COUNT = 20;
export const MIN_COUNT = 1;
export const DIFFICULTIES = ["easy", "medium", "hard"];
export const ANSWER_LETTERS = ["A", "B", "C", "D"];

// Gemini structured-output schema: a JSON array of MCQ objects in the exact
// shape Firestore expects.
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      questionText: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
      correctAnswer: { type: "STRING", enum: ANSWER_LETTERS },
    },
    required: ["questionText", "options", "correctAnswer"],
    propertyOrdering: ["questionText", "options", "correctAnswer"],
  },
};

const BASE_RULES = [
  "You are an expert exam author who writes high-quality multiple-choice questions (MCQs).",
  "Follow these rules strictly:",
  "- Produce exactly the requested number of questions.",
  "- Each question has exactly four answer options.",
  "- Exactly one option is correct. 'correctAnswer' is the letter (A, B, C, or D) of the correct option, where A is the first option, B the second, and so on.",
  "- Distractors (wrong options) must be plausible and relevant but unambiguously incorrect.",
  "- All four options within a question must be distinct.",
  "- Match the requested difficulty level.",
  "- Each question must be self-contained. Do not use 'All of the above' or 'None of the above'.",
  "- Do not number the questions or add commentary. Return only data conforming to the response schema.",
];

const SOURCE_RULE =
  "- Base every question ONLY on the provided source material. Do not use outside knowledge, and do not invent facts that are not supported by the source.";

export class GenerationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "GenerationInputError";
  }
}

export function validateGenerationParams(raw = {}) {
  const difficulty = String(raw.difficulty ?? "").trim().toLowerCase();
  const count = Number(raw.count);
  const sourceText = String(raw.sourceText ?? "").trim();
  const subject = String(raw.subject ?? "").trim();
  const topic = String(raw.topic ?? "").trim();

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

  if (sourceText) {
    return { mode: "source", difficulty, count, sourceText, subject, topic };
  }

  if (!subject) {
    throw new GenerationInputError("Subject is required.");
  }
  if (!topic) {
    throw new GenerationInputError("Topic is required.");
  }
  return { mode: "topic", difficulty, count, subject, topic };
}

// Mirrors ManageQuestionsPage validation so a saved AI question is always a
// valid manual question too.
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

function buildPrompts(clean) {
  if (clean.mode === "source") {
    const system = [...BASE_RULES, SOURCE_RULE].join("\n");
    const header = [
      clean.subject ? `Subject: ${clean.subject}` : null,
      clean.topic ? `Focus topic: ${clean.topic}` : null,
      `Difficulty: ${clean.difficulty}`,
      `Number of questions: ${clean.count}`,
    ]
      .filter(Boolean)
      .join("\n");
    const user = `${header}\n\nSOURCE MATERIAL:\n"""\n${clean.sourceText}\n"""`;
    return { system, user };
  }

  const system = BASE_RULES.join("\n");
  const user = [
    `Subject: ${clean.subject}`,
    `Topic: ${clean.topic}`,
    `Difficulty: ${clean.difficulty}`,
    `Number of questions: ${clean.count}`,
  ].join("\n");
  return { system, user };
}

/**
 * Generates and validates an MCQ array:
 * { questionText, options:[4], correctAnswer:"A"|"B"|"C"|"D" }.
 */
export async function generateQuestions(params, config = {}) {
  const clean = validateGenerationParams(params);
  const { system, user } = buildPrompts(clean);

  const text = await generateContent({
    system,
    user,
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
    apiKey: config.apiKey,
    model: config.model,
    fetchImpl: config.fetchImpl,
  });

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
