// Exam grading/session backend, selected by VITE_EXAM_SECURITY_MODE:
//   "client"    (default) — the browser builds the session and self-grades.
//                Free, but the score is client-controlled (spoofable).
//   "functions" — Firebase callable functions grade server-side (needs Blaze).
//   "vercel"    — Vercel serverless endpoints grade server-side (free on Spark).
//                Recommended for tamper-proof scores.
const RAW_MODE = import.meta.env.VITE_EXAM_SECURITY_MODE;

export const EXAM_SECURITY_MODE =
  RAW_MODE === "functions" ? "functions" : RAW_MODE === "vercel" ? "vercel" : "client";

export const usesFunctionExamFlow = EXAM_SECURITY_MODE === "functions";
export const usesVercelExamFlow = EXAM_SECURITY_MODE === "vercel";
