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
        assessmentType: "exam",
        assessmentMaxScore: 60,
        score: 7,
        total: 10,
        percentage: 70,
        submittedAtMs: 1,
      },
      {
        ...baseResult,
        subject: "HTML",
        examTitle: "HTML Retake",
        assessmentType: "exam",
        assessmentMaxScore: 60,
        score: 9,
        total: 10,
        percentage: 90,
        submittedAtMs: 2,
      },
      {
        ...baseResult,
        subject: "CSS",
        examTitle: "CSS Test",
        assessmentType: "first_assessment",
        assessmentMaxScore: 20,
        score: 8,
        total: 10,
        percentage: 80,
        submittedAtMs: 1,
      },
    ]);

    assert.equal(model.subjectCount, 2);
    assert.equal(model.totalScore, 70);
    assert.equal(model.totalPossible, 200);
    assert.equal(model.average, 35);
    assert.equal(model.grade, "F");
    assert.deepEqual(model.subjects.map((subject) => subject.subject), ["CSS", "HTML"]);
    assert.equal(model.subjects.find((subject) => subject.subject === "HTML").exam.score, 54);
  });

  it("escapes complete result HTML content", () => {
    const html = buildTermResultSheetHtml(
      { ...baseResult, studentName: "<script>alert(1)</script>" },
      [{ ...baseResult, studentName: "<script>alert(1)</script>", subject: "HTML" }],
    );

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("uses the shared result sheet template for term exports", () => {
    const html = buildTermResultSheetHtml(
      { ...baseResult, school: "Aretha Sage Academy" },
      [{ ...baseResult, subject: "HTML" }],
    );

    assert.match(html, /Result Sheet/);
    assert.match(html, /OVERALL GRADE/);
    assert.match(html, /First Assessment/);
    assert.match(html, /Second Assessment/);
    assert.match(html, /Exam \(60%\)/);
    assert.doesNotMatch(html, /Full Term Result Sheet/);
  });

  it("builds complete result filenames", () => {
    assert.equal(
      buildTermResultFilename(baseResult, "doc"),
      "Bright-Future-Academy-JSS1-A-Amina-Yusuf-2026-2027-First-Term.doc",
    );
  });
});
