import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ASSESSMENT_TYPES,
  DEFAULT_ASSESSMENT_TYPE,
  getAssessmentMaxScore,
  normalizeAssessmentType,
} from "../../lib/assessmentTypes";
import { db } from "../../lib/firebase";
import {
  downloadTermResultDoc,
  printTermResultPdf,
} from "../../lib/resultExports";
import { buildTermResultModel } from "../../lib/termResultData";
import {
  buildCsv,
  downloadTextFile,
  formatDateValue,
} from "../../lib/utils";

function getStudentLabel(student) {
  return `${student.fullName || "Unnamed Student"}${student.admissionNumber ? ` (${student.admissionNumber})` : ""
    }`;
}

function getStudentKey(student) {
  return student.id || student.studentId || student.fullName || "";
}

function createSourceResult(student, filters) {
  return {
    studentId: student.id || student.studentId || "",
    studentName: student.fullName || student.studentName || "",
    admissionNumber: student.admissionNumber || "",
    schoolId: student.schoolId || filters.schoolId || "",
    school: student.schoolName || student.school || "",
    classId: student.classId || "",
    class: student.className || student.class || "",
    academicSession: filters.academicSession,
    term: filters.term,
  };
}

function getScoreDisplay(assessment) {
  return assessment?.hasScore ? assessment.score : "-";
}

export default function ResultsDashboardPage() {
  const [schools, setSchools] = useState([]);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
  const [manualScores, setManualScores] = useState([]);
  const [termNotes, setTermNotes] = useState([]);
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState({
    schoolId: "",
    studentId: "",
    academicSession: "",
    term: "",
  });
  const [manualForm, setManualForm] = useState({
    subject: "",
    assessmentType: DEFAULT_ASSESSMENT_TYPE,
    score: "",
    note: "",
  });
  const [attendance, setAttendance] = useState({
    daysOfSchool: "",
    daysAttended: "",
    daysAbsent: "",
  });

  useEffect(() => {
    const unsubscribes = [
      onSnapshot(query(collection(db, "schools"), orderBy("name", "asc")), (snapshot) => {
        setSchools(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }),
      onSnapshot(query(collection(db, "students"), orderBy("fullName", "asc")), (snapshot) => {
        setStudents(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }),
      onSnapshot(query(collection(db, "results"), orderBy("submittedAt", "desc")), (snapshot) => {
        setResults(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }),
      onSnapshot(query(collection(db, "manualScores"), orderBy("createdAt", "desc")), (snapshot) => {
        setManualScores(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }),
      onSnapshot(query(collection(db, "termNotes"), orderBy("createdAt", "desc")), (snapshot) => {
        setTermNotes(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }).catch(() => {
        // termNotes collection may not exist yet, this is fine
        setTermNotes([]);
      }),
    ];

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);

  const schoolOptions = useMemo(
    () => schools.filter((school) => school.isActive !== false),
    [schools],
  );
  const studentOptions = useMemo(
    () =>
      students.filter(
        (student) =>
          student.isActive !== false &&
          (!filters.schoolId || student.schoolId === filters.schoolId),
      ),
    [filters.schoolId, students],
  );
  const selectedStudent = studentOptions.find(
    (student) => getStudentKey(student) === filters.studentId,
  );

  const studentHistory = useMemo(() => {
    if (!selectedStudent) return [];
    const key = selectedStudent.id || "";
    const name = selectedStudent.fullName || "";

    return [
      ...results.filter(
        (result) =>
          (key && result.studentId === key) ||
          (!key && result.studentName === name),
      ),
      ...manualScores.filter(
        (score) =>
          (key && score.studentId === key) ||
          (!key && score.studentName === name),
      ),
    ];
  }, [manualScores, results, selectedStudent]);

  const academicSessions = useMemo(
    () => [...new Set(studentHistory.map((item) => item.academicSession).filter(Boolean))],
    [studentHistory],
  );
  const terms = useMemo(
    () => [...new Set(studentHistory.map((item) => item.term).filter(Boolean))],
    [studentHistory],
  );

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      schoolId: current.schoolId || schoolOptions[0]?.id || "",
    }));
  }, [schoolOptions]);

  useEffect(() => {
    setFilters((current) => {
      const validStudent = studentOptions.some(
        (student) => getStudentKey(student) === current.studentId,
      );

      return {
        ...current,
        studentId: validStudent ? current.studentId : studentOptions[0]?.id || "",
      };
    });
  }, [studentOptions]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      academicSession:
        current.academicSession && academicSessions.includes(current.academicSession)
          ? current.academicSession
          : academicSessions[0] || "",
      term:
        current.term && terms.includes(current.term)
          ? current.term
          : terms[0] || "",
    }));
  }, [academicSessions, terms]);

  const sourceResult = selectedStudent
    ? createSourceResult(selectedStudent, filters)
    : null;
  const model = sourceResult
    ? buildTermResultModel(sourceResult, results, manualScores)
    : null;
  const matchingManualScores = manualScores.filter(
    (score) =>
      sourceResult &&
      (score.studentId || score.studentName) ===
      (sourceResult.studentId || sourceResult.studentName) &&
      (score.schoolId || score.school) === (sourceResult.schoolId || sourceResult.school) &&
      score.academicSession === sourceResult.academicSession &&
      score.term === sourceResult.term,
  );

  const updateFilter = (name, value) => {
    setStatus("");
    setFilters((current) => ({
      ...current,
      [name]: value,
      ...(name === "schoolId" ? { studentId: "", academicSession: "", term: "" } : {}),
      ...(name === "studentId" ? { academicSession: "", term: "" } : {}),
    }));
  };

  const saveManualScore = async (event) => {
    event.preventDefault();
    setStatus("");

    if (!sourceResult) {
      setStatus("Select a school, student, session, and term before adding a manual score.");
      return;
    }

    const subject = manualForm.subject.trim();
    const assessmentType = normalizeAssessmentType(manualForm.assessmentType);
    const score = Number(manualForm.score);
    const maxScore = getAssessmentMaxScore(assessmentType);

    if (!subject) {
      setStatus("Enter a subject for the manual score.");
      return;
    }

    if (!Number.isFinite(score) || score < 0) {
      setStatus("Manual score must be zero or higher.");
      return;
    }

    await addDoc(collection(db, "manualScores"), {
      ...sourceResult,
      subject,
      assessmentType,
      score: Math.min(score, maxScore),
      maxScore,
      note: manualForm.note.trim(),
      createdAt: serverTimestamp(),
    });

    setManualForm((current) => ({ ...current, subject: "", score: "", note: "" }));
    setStatus("Manual score saved.");
  };

  const exportCsv = () => {
    if (!model) return;

    const rows = [
      [
        "Student",
        "Admission Number",
        "School",
        "Class",
        "Session",
        "Term",
        "Subject",
        "First Assessment",
        "Second Assessment",
        "Exam",
        "Total",
        "Percentage",
        "Remark",
      ],
      ...model.subjects.map((subject) => [
        model.studentName,
        model.admissionNumber,
        model.school,
        model.className,
        model.academicSession,
        model.term,
        subject.subject,
        getScoreDisplay(subject.firstAssessment),
        getScoreDisplay(subject.secondAssessment),
        getScoreDisplay(subject.exam),
        `${subject.totalScore}/${subject.totalPossible}`,
        `${subject.percentage}%`,
        subject.remark,
      ]),
    ];

    downloadTextFile(
      `${model.studentName}-${model.academicSession}-${model.term}-combined-result.csv`,
      buildCsv(rows),
      "text/csv",
    );
  };

  const handlePrintPdf = () => {
    if (sourceResult) {
      const schoolData = schools.find((s) => s.id === sourceResult.schoolId) || {};
      const termNotesEntry = termNotes.find(
        (tn) =>
          tn.studentId === sourceResult.studentId &&
          tn.academicSession === sourceResult.academicSession &&
          tn.term === sourceResult.term,
      );
      const attendanceData = {
        daysOfSchool: Number(attendance.daysOfSchool) || 0,
        daysAttended: Number(attendance.daysAttended) || 0,
        daysAbsent: Number(attendance.daysAbsent) || 0,
      };
      printTermResultPdf(
        sourceResult,
        results,
        schoolData,
        termNotesEntry?.notes || "",
        attendanceData,
        manualScores,
      );
    }
  };

  const handleDownloadDoc = () => {
    if (sourceResult) {
      const schoolData = schools.find((s) => s.id === sourceResult.schoolId) || {};
      const termNotesEntry = termNotes.find(
        (tn) =>
          tn.studentId === sourceResult.studentId &&
          tn.academicSession === sourceResult.academicSession &&
          tn.term === sourceResult.term,
      );
      const attendanceData = {
        daysOfSchool: Number(attendance.daysOfSchool) || 0,
        daysAttended: Number(attendance.daysAttended) || 0,
        daysAbsent: Number(attendance.daysAbsent) || 0,
      };
      downloadTermResultDoc(
        sourceResult,
        results,
        schoolData,
        termNotesEntry?.notes || "",
        attendanceData,
        manualScores,
      );
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Results Dashboard</h2>
        <p>Select a school, student, session, and term to build a full combined result.</p>
      </div>

      <div className="card filters-card">
        <div className="field-grid">
          <label className="field">
            <span>School</span>
            <select
              value={filters.schoolId}
              onChange={(event) => updateFilter("schoolId", event.target.value)}
            >
              <option value="">Select school</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Student</span>
            <select
              value={filters.studentId}
              onChange={(event) => updateFilter("studentId", event.target.value)}
            >
              <option value="">Select student</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {getStudentLabel(student)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Academic Session</span>
            <select
              value={filters.academicSession}
              onChange={(event) => updateFilter("academicSession", event.target.value)}
            >
              <option value="">Select session</option>
              {academicSessions.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Term</span>
            <select
              value={filters.term}
              onChange={(event) => updateFilter("term", event.target.value)}
            >
              <option value="">Select term</option>
              {terms.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="section-heading" style={{ marginTop: "20px", marginBottom: "12px" }}>
          <h3>Attendance (Optional)</h3>
          <p>Leave blank if not applicable. These values will appear in the exported result sheet.</p>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Days of School</span>
            <input
              type="number"
              min="0"
              value={attendance.daysOfSchool}
              onChange={(event) =>
                setAttendance((current) => ({
                  ...current,
                  daysOfSchool: event.target.value,
                }))
              }
              placeholder="e.g., 110"
            />
          </label>

          <label className="field">
            <span>Days Attended</span>
            <input
              type="number"
              min="0"
              value={attendance.daysAttended}
              onChange={(event) =>
                setAttendance((current) => ({
                  ...current,
                  daysAttended: event.target.value,
                }))
              }
              placeholder="e.g., 98"
            />
          </label>

          <label className="field">
            <span>Days Absent</span>
            <input
              type="number"
              min="0"
              value={attendance.daysAbsent}
              onChange={(event) =>
                setAttendance((current) => ({
                  ...current,
                  daysAbsent: event.target.value,
                }))
              }
              placeholder="e.g., 12"
            />
          </label>
        </div>

        <div className="button-row">
          <button className="secondary-button" disabled={!model} onClick={exportCsv} type="button">
            Export CSV
          </button>
          <button className="secondary-button" disabled={!model} onClick={handlePrintPdf} type="button">
            Full PDF
          </button>
          <button className="primary-button" disabled={!model} onClick={handleDownloadDoc} type="button">
            Full DOC
          </button>
        </div>
      </div>

      <form className="card form-card" onSubmit={saveManualScore}>
        <div className="section-heading">
          <h3>Manual Score Entry</h3>
          <p>Add scores for practicals, projects, paper tests, or offline grading.</p>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>Subject</span>
            <input
              value={manualForm.subject}
              onChange={(event) =>
                setManualForm((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="HTML"
            />
          </label>

          <label className="field">
            <span>Assessment Type</span>
            <select
              value={manualForm.assessmentType}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  assessmentType: event.target.value,
                  score: "",
                }))
              }
            >
              {ASSESSMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} ({type.maxScore} marks)
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>Manual Score</span>
            <input
              max={getAssessmentMaxScore(manualForm.assessmentType)}
              min="0"
              type="number"
              value={manualForm.score}
              onChange={(event) =>
                setManualForm((current) => ({ ...current, score: event.target.value }))
              }
              placeholder={`0-${getAssessmentMaxScore(manualForm.assessmentType)}`}
            />
          </label>

          <label className="field">
            <span>Note</span>
            <input
              value={manualForm.note}
              onChange={(event) =>
                setManualForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Optional note"
            />
          </label>
        </div>
        {status ? <p className="muted-text">{status}</p> : null}
        <button className="primary-button" disabled={!sourceResult} type="submit">
          Save Manual Score
        </button>
      </form>

      <div className="card table-card">
        <div className="section-heading">
          <h3>Combined Term Result</h3>
          <p>
            {model
              ? `${model.studentName} - ${model.academicSession} - ${model.term}`
              : "Select a student, session, and term to view the result."}
          </p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>First Assessment / 20</th>
                <th>Second Assessment / 20</th>
                <th>Exam / 60</th>
                <th>Total / 100</th>
                <th>%</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {model?.subjects.map((subject) => (
                <tr key={subject.subject}>
                  <td>{subject.subject}</td>
                  <td>{getScoreDisplay(subject.firstAssessment)}</td>
                  <td>{getScoreDisplay(subject.secondAssessment)}</td>
                  <td>{getScoreDisplay(subject.exam)}</td>
                  <td>
                    {subject.totalScore}/{subject.totalPossible}
                  </td>
                  <td>{subject.percentage}%</td>
                  <td>{subject.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model && !model.subjects.length ? (
            <p className="muted-text">No results found for this student, session, and term.</p>
          ) : null}
        </div>
      </div>

      <div className="card list-card">
        <div className="section-heading">
          <h3>Manual Scores In This Result</h3>
          <p>{matchingManualScores.length} manual score entries</p>
        </div>
        <div className="stack-list">
          {matchingManualScores.map((score) => (
            <article className="stack-list__item" key={score.id}>
              <div>
                <strong>{score.subject}</strong>
                <p>
                  {ASSESSMENT_TYPES.find((type) => type.value === score.assessmentType)?.label ||
                    "Exam"} - {score.score}/{score.maxScore || getAssessmentMaxScore(score.assessmentType)}
                </p>
                <small>{score.note || "No note"} - {formatDateValue(score.createdAt)}</small>
              </div>
              <button
                className="danger-button"
                onClick={() => deleteDoc(doc(db, "manualScores", score.id))}
                type="button"
              >
                Delete
              </button>
            </article>
          ))}
          {!matchingManualScores.length ? (
            <p className="muted-text">No manual scores for this selected result.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
