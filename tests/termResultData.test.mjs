import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTermResultFilename,
  buildTermResultModel,
  buildTermResultSheetHtml,
  getMatchingTermResults,
} from "../src/lib/termResultData.js";

const baseResult = {
  studentId: "student-1",
  studentName: "Amina Yusuf",
  admissionNumber: "ADM-001",
  schoolId: "school-1",
  school: "Bright Future Academy",
  classId: "class-1",
  class: "JSS1 A",
  academicSession: "2026/2027",
  term: "First Term",
};

describe("term result data", () => {
  it("matches only results for the same student, class, session, and term", () => {
    const results = [
      { ...baseResult, subject: "HTML" },
      { ...baseResult, subject: "CSS" },
      { ...baseResult, studentId: "student-2", subject: "HTML" },
      { ...baseResult, term: "Second Term", subject: "HTML" },
    ];

    assert.equal(getMatchingTermResults(baseResult, results).length, 2);
  });

  it("aggregates latest subject attempts into a complete term result", () => {
    const model = buildTermResultModel(baseResult, [
      {
        ...baseResult,
        subject: "HTML",
        examTitle: "HTML Test",
        score: 7,
        total: 10,
        percentage: 70,
        submittedAtMs: 1,
      },
      {
        ...baseResult,
        subject: "HTML",
        examTitle: "HTML Retake",
        score: 9,
        total: 10,
        percentage: 90,
        submittedAtMs: 2,
      },
      {
        ...baseResult,
        subject: "CSS",
        examTitle: "CSS Test",
        score: 8,
        total: 10,
        percentage: 80,
        submittedAtMs: 1,
      },
    ]);

    assert.equal(model.subjectCount, 2);
    assert.equal(model.totalScore, 17);
    assert.equal(model.totalPossible, 20);
    assert.equal(model.average, 85);
    assert.equal(model.grade, "A");
    assert.deepEqual(model.subjects.map((subject) => subject.subject), ["CSS", "HTML"]);
    assert.equal(model.subjects.find((subject) => subject.subject === "HTML").score, 9);
  });

  it("escapes complete result HTML content", () => {
    const html = buildTermResultSheetHtml(
      { ...baseResult, studentName: "<script>alert(1)</script>" },
      [{ ...baseResult, studentName: "<script>alert(1)</script>", subject: "HTML" }],
    );

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("builds complete result filenames", () => {
    assert.equal(
      buildTermResultFilename(baseResult, "doc"),
      "Bright-Future-Academy-JSS1-A-Amina-Yusuf-2026-2027-First-Term.doc",
    );
  });
});
