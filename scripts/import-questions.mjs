import fs from "fs";
import admin from "firebase-admin";
import { parse } from "csv-parse/sync";

function getArgValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const inlineValue = process.argv.find((argument) => argument.startsWith(prefix));

  if (inlineValue) {
    return inlineValue.slice(prefix.length).trim();
  }

  const argumentIndex = process.argv.indexOf(`--${name}`);
  if (argumentIndex !== -1) {
    return process.argv[argumentIndex + 1]?.trim() || fallback;
  }

  return fallback;
}

const serviceAccountPath = getArgValue("service-account", "./service-account.json");
const csvPath = getArgValue("csv", "./questions.csv");
const examId = getArgValue("exam-id", process.env.RESULTPILOT_EXAM_ID || "");
const dryRun = process.argv.includes("--dry-run");

if (!examId) {
  throw new Error(
    "Missing exam ID. Run: npm run questions:import -- --exam-id YOUR_EXAM_ID",
  );
}

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Missing ${serviceAccountPath}. Download a Firebase service account key and place it in the project root.`,
  );
}

if (!fs.existsSync(csvPath)) {
  throw new Error(
    `Missing ${csvPath}. Create your CSV file in the project root before running the importer.`,
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const csvText = fs.readFileSync(csvPath, "utf8");
const rows = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

const questions = rows.map((row, index) => {
  const questionText = row.questionText?.trim();
  const optionA = row.optionA?.trim();
  const optionB = row.optionB?.trim();
  const optionC = row.optionC?.trim();
  const optionD = row.optionD?.trim();
  const correctAnswer = row.correctAnswer?.trim().toUpperCase();

  if (!questionText || !optionA || !optionB || !optionC || !optionD) {
    throw new Error(
      `Invalid row ${index + 1}: every question and option field is required. Row data: ${JSON.stringify(row)}`,
    );
  }

  if (!["A", "B", "C", "D"].includes(correctAnswer)) {
    throw new Error(
      `Invalid correctAnswer on row ${index + 1} for question "${questionText}". Use only A, B, C, or D.`,
    );
  }

  return {
    questionText,
    options: [optionA, optionB, optionC, optionD],
    correctAnswer,
  };
});

const seenQuestions = new Set();
for (const question of questions) {
  const key = question.questionText.toLowerCase();
  if (seenQuestions.has(key)) {
    throw new Error(`Duplicate question in CSV: "${question.questionText}"`);
  }
  seenQuestions.add(key);
}

const examRef = db.collection("exams").doc(examId);
const examSnapshot = await examRef.get();

if (!examSnapshot.exists) {
  throw new Error(`Exam ${examId} does not exist. Create the exam before importing questions.`);
}

if (dryRun) {
  console.log(`Validated ${questions.length} questions for exam ${examId}. No questions were imported.`);
  process.exit(0);
}

for (const question of questions) {
  await examRef.collection("questions").add({
    ...question,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

console.log(`Imported ${questions.length} questions into exam ${examId}.`);
