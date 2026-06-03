import { httpsCallable } from "firebase/functions";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore/lite";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useExamSession } from "../context/ExamSessionContext";
import { usesFunctionExamFlow } from "../lib/examMode";
import { cloudFunctions, liteDb } from "../lib/firebase";
import { shuffleArray } from "../lib/utils";

function getSetupErrorMessage(error) {
  if (error?.code === "functions/not-found") {
    return "Exam setup service is not deployed yet. Ask the tutor to redeploy the app backend.";
  }

  if (error?.code === "functions/internal") {
    return "Exam setup service returned an internal error. Ask the tutor to refresh the deployment.";
  }

  return error?.message || "Unable to load active exam setup.";
}

export default function StudentRegistrationPage() {
  const navigate = useNavigate();
  const { startSession, clearSession } = useExamSession();
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({
    schoolId: "",
    classId: "",
    studentId: "",
    schoolName: "",
    className: "",
    fullName: "",
    admissionNumber: "",
    subject: "",
    pin: "",
  });
  const [subjects, setSubjects] = useState([]);
  const [activeExams, setActiveExams] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadActiveSetupData() {
      try {
        if (usesFunctionExamFlow) {
          const getStudentRegistrationSetup = httpsCallable(
            cloudFunctions,
            "getStudentRegistrationSetup",
          );
          const response = await getStudentRegistrationSetup();

          if (!active) {
            return;
          }

          const setup = response.data || {};
          const uniqueSubjects = Array.isArray(setup.subjects) ? setup.subjects : [];

          setSchools(Array.isArray(setup.schools) ? setup.schools : []);
          setClasses(Array.isArray(setup.classes) ? setup.classes : []);
          setStudents([]);
          setActiveExams([]);
          setSubjects(uniqueSubjects);
          setForm((current) => ({
            ...current,
            subject: current.subject || uniqueSubjects[0] || "",
          }));
          return;
        }

        const [schoolsSnapshot, classesSnapshot, studentsSnapshot, examsSnapshot] =
          await Promise.all([
            getDocs(query(collection(liteDb, "schools"), where("isActive", "==", true))),
            getDocs(query(collection(liteDb, "classes"), where("isActive", "==", true))),
            getDocs(query(collection(liteDb, "students"), where("isActive", "==", true))),
            getDocs(query(collection(liteDb, "exams"), where("isActive", "==", true))),
          ]);

        if (!active) {
          return;
        }

        setSchools(
          schoolsSnapshot.docs
            .map((document) => ({ id: document.id, ...document.data() }))
            .sort((first, second) => first.name.localeCompare(second.name)),
        );

        setClasses(
          classesSnapshot.docs
            .map((document) => ({ id: document.id, ...document.data() }))
            .sort((first, second) => first.name.localeCompare(second.name)),
        );

        setStudents(
          studentsSnapshot.docs
            .map((document) => ({ id: document.id, ...document.data() }))
            .sort((first, second) => first.fullName.localeCompare(second.fullName)),
        );

        const exams = examsSnapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));
        const uniqueSubjects = [...new Set(
          exams
            .map((exam) => exam.subject)
            .filter((subject) => typeof subject === "string" && subject.trim()),
        )];

        setActiveExams(exams);
        setSubjects(uniqueSubjects);
        setForm((current) => ({
          ...current,
          subject: current.subject || uniqueSubjects[0] || "",
        }));
      } catch (setupError) {
        if (active) {
          setError(`Unable to load active exam setup: ${getSetupErrorMessage(setupError)}`);
        }
      }
    }

    loadActiveSetupData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      schoolId: current.schoolId || schools[0]?.id || "",
    }));
  }, [schools]);

  const classOptions = useMemo(
    () => classes.filter((classItem) => classItem.schoolId === form.schoolId),
    [classes, form.schoolId],
  );

  const studentOptions = useMemo(
    () => students.filter((student) => student.classId === form.classId),
    [students, form.classId],
  );

  const hasSchoolOptions = schools.length > 0;
  const hasClassOptions = classOptions.length > 0;
  const hasStudentOptions = studentOptions.length > 0;

  useEffect(() => {
    setForm((current) => {
      const validClass = classOptions.some((classItem) => classItem.id === current.classId);

      return {
        ...current,
        classId: validClass ? current.classId : classOptions[0]?.id || "",
      };
    });
  }, [classOptions]);

  useEffect(() => {
    setForm((current) => {
      const validStudent = studentOptions.some((student) => student.id === current.studentId);

      return {
        ...current,
        studentId: validStudent ? current.studentId : studentOptions[0]?.id || "",
      };
    });
  }, [studentOptions]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "schoolId" ? { classId: "", studentId: "", schoolName: "" } : {}),
      ...(name === "classId" ? { studentId: "", className: "" } : {}),
      ...(name === "studentId" ? { fullName: "" } : {}),
      ...(name === "schoolName" ? { schoolId: "", classId: "", studentId: "" } : {}),
      ...(name === "className" ? { classId: "", studentId: "" } : {}),
      ...(name === "fullName" ? { studentId: "" } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const selectedSchool = schools.find((school) => school.id === form.schoolId);
    const selectedClass = classes.find((classItem) => classItem.id === form.classId);
    const selectedStudent = students.find((student) => student.id === form.studentId);

    const schoolName = selectedSchool?.name || form.schoolName.trim();
    const className = selectedClass?.name || form.className.trim();
    const studentFullName = selectedStudent?.fullName || form.fullName.trim();
    const admissionNumber = selectedStudent?.admissionNumber || form.admissionNumber.trim();
    const pin = form.pin.trim();

    if (!schoolName || !className || !studentFullName || !pin) {
      setError("Complete all fields before starting the exam.");
      return;
    }

    setLoading(true);

    try {
      clearSession();

      if (usesFunctionExamFlow) {
        const startExamSession = httpsCallable(cloudFunctions, "startExamSession");
        const response = await startExamSession({
          fullName: studentFullName,
          admissionNumber,
          className,
          schoolName,
          studentId: selectedStudent?.id || "",
          classId: selectedClass?.id || "",
          schoolId: selectedSchool?.id || "",
          subject: form.subject,
          pin,
        });

        startSession(response.data);
        navigate("/exam");
        return;
      }

      const matchingExams = activeExams.filter(
        (exam) =>
          exam.subject === form.subject &&
          String(exam.pin || "").trim() === pin &&
          exam.isActive === true,
      );

      if (!matchingExams.length) {
        setError(
          "No active exam matches that subject and access PIN. " +
          "Verify the subject and PIN exactly, or ask your tutor if the exam is active.",
        );
        return;
      }

      if (matchingExams.length > 1) {
        setError(
          "Multiple active exams match this subject and PIN. Contact the tutor before continuing.",
        );
        return;
      }

      const examData = matchingExams[0];
      const questionsSnapshot = await getDocs(
        query(
          collection(liteDb, "exams", examData.id, "questions"),
          orderBy("createdAt", "asc"),
        ),
      );
      const questions = questionsSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));

      if (!questions.length) {
        setError("This exam has no questions yet. Contact the tutor.");
        return;
      }

      const selectedQuestions = shuffleArray(questions);

      const startedAt = Date.now();

      startSession({
        sessionId:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `session-${startedAt}`,
        student: {
          id: selectedStudent?.id || "",
          fullName: studentFullName,
          admissionNumber,
          classId: selectedClass?.id || "",
          className,
          schoolId: selectedSchool?.id || "",
          schoolName,
        },
        exam: {
          ...examData,
          assessmentType: examData.assessmentType || "exam",
          assessmentMaxScore: Number(examData.assessmentMaxScore || 60),
        },
        questions: selectedQuestions,
        answers: {},
        currentIndex: 0,
        startedAt,
        endsAt: startedAt + Number(examData.duration) * 60 * 1000,
        submittedResult: null,
        status: "in_progress",
      });

      navigate("/exam");
    } catch (submissionError) {
      setError(submissionError.message || "Unable to start exam.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">ResultPilot</span>
          <h1>Smart Exam Management</h1>
          <p>
            Students join with an access PIN. Tutors manage exams, questions,
            and results from a single dashboard.
          </p>
        </div>
        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Start your exam</h2>
            <p>Enter your details exactly as your tutor expects.</p>
          </div>

          <div className="field-grid">
            {hasSchoolOptions ? (
              <label className="field">
                <span>School</span>
                <select
                  name="schoolId"
                  value={form.schoolId}
                  onChange={updateField}
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>School name</span>
                <input
                  name="schoolName"
                  value={form.schoolName}
                  onChange={updateField}
                  placeholder="Type school name"
                />
              </label>
            )}

            {hasClassOptions ? (
              <label className="field">
                <span>Class</span>
                <select
                  name="classId"
                  value={form.classId}
                  onChange={updateField}
                >
                  <option value="">Select class</option>
                  {classOptions.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>Class name</span>
                <input
                  name="className"
                  value={form.className}
                  onChange={updateField}
                  placeholder="Type class name"
                />
              </label>
            )}
          </div>

          {hasStudentOptions ? (
            <label className="field">
              <span>Student</span>
              <select name="studentId" value={form.studentId} onChange={updateField}>
                <option value="">Select student</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName}
                    {student.admissionNumber ? ` (${student.admissionNumber})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field-grid">
              <label className="field">
                <span>Student full name</span>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={updateField}
                  placeholder="Type your full name"
                />
              </label>

              <label className="field">
                <span>Admission number</span>
                <input
                  name="admissionNumber"
                  value={form.admissionNumber}
                  onChange={updateField}
                  placeholder="Optional admission number"
                />
              </label>
            </div>
          )}

          <div className="field-grid">
            <label className="field">
              <span>Subject / Program</span>
              <select name="subject" value={form.subject} onChange={updateField}>
                <option value="" disabled>
                  {subjects.length ? "Select subject" : "No active exams available"}
                </option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>PIN / Access Code</span>
              <input
                name="pin"
                value={form.pin}
                onChange={updateField}
                placeholder="Enter exam PIN"
              />
            </label>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Preparing exam..." : "Start Exam"}
          </button>
        </form>
      </section>
    </div>
  );
}
