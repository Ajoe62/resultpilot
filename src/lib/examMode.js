export const EXAM_SECURITY_MODE =
  import.meta.env.VITE_EXAM_SECURITY_MODE === "client" ? "client" : "functions";

export const usesFunctionExamFlow = EXAM_SECURITY_MODE === "functions";
