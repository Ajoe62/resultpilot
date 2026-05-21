export const ASSESSMENT_TYPES = [
  { value: "first_assessment", label: "First Assessment", maxScore: 20 },
  { value: "second_assessment", label: "Second Assessment", maxScore: 20 },
  { value: "exam", label: "Exam", maxScore: 60 },
];

export const DEFAULT_ASSESSMENT_TYPE = "exam";

export function getAssessmentConfig(value) {
  return (
    ASSESSMENT_TYPES.find((type) => type.value === value) ||
    ASSESSMENT_TYPES.find((type) => type.value === DEFAULT_ASSESSMENT_TYPE)
  );
}

export function getAssessmentLabel(value) {
  return getAssessmentConfig(value).label;
}

export function getAssessmentMaxScore(value) {
  return getAssessmentConfig(value).maxScore;
}

export function normalizeAssessmentType(value) {
  return getAssessmentConfig(value).value;
}
