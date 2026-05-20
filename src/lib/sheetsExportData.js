export function sanitizeSheetTitle(value) {
  const cleaned = String(value || "Results")
    .replace(/[\\/?*[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "Results").slice(0, 90);
}

function getGroupKey(result) {
  return [
    result.schoolId || result.school || "unknown-school",
    result.classId || result.class || "unknown-class",
  ].join("__");
}

function groupResults(results) {
  const groups = new Map();

  for (const result of results) {
    const key = getGroupKey(result);

    if (!groups.has(key)) {
      groups.set(key, {
        school: result.school || "Unknown School",
        className: result.class || "Unknown Class",
        results: [],
      });
    }

    groups.get(key).results.push(result);
  }

  return [...groups.values()].sort((first, second) => {
    const schoolCompare = first.school.localeCompare(second.school);
    return schoolCompare || first.className.localeCompare(second.className);
  });
}

function buildRows(results) {
  return [
    [
      "Student Name",
      "Admission Number",
      "School",
      "Class",
      "Subject",
      "Academic Session",
      "Term",
      "Score",
      "Total",
      "Percentage",
      "Passed",
      "Time Taken (s)",
      "Submitted At",
      "Student ID",
      "School ID",
      "Class ID",
      "Result ID",
    ],
    ...results.map((result) => [
      result.studentName || "",
      result.admissionNumber || "",
      result.school || "",
      result.class || "",
      result.subject || "",
      result.academicSession || "",
      result.term || "",
      result.score ?? "",
      result.total ?? "",
      result.percentage ?? "",
      result.passed ? "Yes" : "No",
      result.timeTaken ?? "",
      result.submittedAtMs ? new Date(result.submittedAtMs).toISOString() : "",
      result.studentId || "",
      result.schoolId || "",
      result.classId || "",
      result.id || "",
    ]),
  ];
}

export function buildSheetsExportPlan(results) {
  const exports = groupResults(results).map((group) => ({
    title: sanitizeSheetTitle(`${group.school} - ${group.className}`),
    rows: buildRows(group.results),
    count: group.results.length,
  }));
  const usedTitles = new Set();

  for (const exportGroup of exports) {
    let title = exportGroup.title;
    let suffix = 2;

    while (usedTitles.has(title)) {
      title = sanitizeSheetTitle(`${exportGroup.title} ${suffix}`);
      suffix += 1;
    }

    exportGroup.title = title;
    usedTitles.add(title);
  }

  return exports;
}
