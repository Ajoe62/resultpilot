export const EXAM_SECURITY_MODE =
  import.meta.env.VITE_EXAM_SECURITY_MODE === "functions"
    ? "functions"
    : "client";

export const usesFunctionExamFlow = EXAM_SECURITY_MODE === "functions";
