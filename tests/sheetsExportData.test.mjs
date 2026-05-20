import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSheetsExportPlan,
  sanitizeSheetTitle,
} from "../src/lib/sheetsExportData.js";

describe("sheets export data", () => {
  it("sanitizes Google Sheet tab titles", () => {
    assert.equal(
      sanitizeSheetTitle("Bright/Future:Academy * JSS1?A"),
      "Bright-Future-Academy - JSS1-A",
    );
  });

  it("groups result rows by school and class", () => {
    const plan = buildSheetsExportPlan([
      {
        id: "r1",
        studentName: "Amina Yusuf",
        admissionNumber: "ADM-001",
        school: "Bright Future Academy",
        schoolId: "school-1",
        class: "JSS1 A",
        classId: "class-1",
        subject: "HTML",
        academicSession: "2026/2027",
        term: "First Term",
        score: 8,
        total: 10,
        percentage: 80,
        passed: true,
        timeTaken: 90,
        submittedAtMs: Date.UTC(2026, 0, 1),
        studentId: "student-1",
      },
      {
        id: "r2",
        studentName: "Tunde Musa",
        school: "Bright Future Academy",
        schoolId: "school-1",
        class: "JSS1 A",
        classId: "class-1",
        subject: "CSS",
        score: 7,
        total: 10,
        percentage: 70,
        passed: true,
        timeTaken: 120,
        studentId: "student-2",
      },
    ]);

    assert.equal(plan.length, 1);
    assert.equal(plan[0].title, "Bright Future Academy - JSS1 A");
    assert.equal(plan[0].count, 2);
    assert.equal(plan[0].rows.length, 3);
    assert.equal(plan[0].rows[1][0], "Amina Yusuf");
    assert.equal(plan[0].rows[1][16], "r1");
  });

  it("keeps duplicate generated tab names unique", () => {
    const plan = buildSheetsExportPlan([
      {
        id: "r1",
        school: "School",
        schoolId: "school-1",
        class: "Class",
        classId: "class-1",
      },
      {
        id: "r2",
        school: "School",
        schoolId: "school-2",
        class: "Class",
        classId: "class-2",
      },
    ]);

    assert.deepEqual(
      plan.map((group) => group.title),
      ["School - Class", "School - Class 2"],
    );
  });
});
