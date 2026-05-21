import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResultFilename,
  buildResultSheetHtml,
  buildResultSheetModel,
  getResultGrade,
  sanitizeFilename,
} from "../src/lib/resultSheetData.js";

describe("result sheet data", () => {
  it("maps percentages to basic grades", () => {
    assert.equal(getResultGrade(70), "A");
    assert.equal(getResultGrade(60), "B");
    assert.equal(getResultGrade(50), "C");
    assert.equal(getResultGrade(45), "D");
    assert.equal(getResultGrade(40), "D");
    assert.equal(getResultGrade(39), "F");
  });

  it("sanitizes generated filenames", () => {
    assert.equal(
      sanitizeFilename("Bright/Future: Academy - JSS1 A - Amina"),
      "Bright-Future-Academy-JSS1-A-Amina",
    );
  });

  it("builds a result model with grade and remark", () => {
    const model = buildResultSheetModel({
      studentName: "Amina Yusuf",
      school: "Bright Future Academy",
      class: "JSS1 A",
      subject: "HTML",
      score: 8,
      total: 10,
      percentage: 80,
      passed: true,
    });

    assert.equal(model.studentName, "Amina Yusuf");
    assert.equal(model.grade, "A");
    assert.equal(model.remark, "Excellent");
    assert.equal(model.status, "Passed");
  });

  it("escapes result HTML content", () => {
    const html = buildResultSheetHtml({
      studentName: "<script>alert(1)</script>",
      school: "Bright & Future",
      class: "JSS1 A",
      subject: "HTML",
      score: 8,
      total: 10,
      percentage: 80,
      passed: true,
    });

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Bright &amp; Future/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("builds doc/pdf filenames from result identity fields", () => {
    assert.equal(
      buildResultFilename({
        studentName: "Amina Yusuf",
        school: "Bright Future",
        class: "JSS1 A",
        subject: "HTML",
      }, "doc"),
      "Bright-Future-JSS1-A-Amina-Yusuf-HTML.doc",
    );
  });
});
