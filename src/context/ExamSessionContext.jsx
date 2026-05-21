import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { createContext, useContext, useEffect, useState } from "react";
import { usesFunctionExamFlow } from "../lib/examMode";
import { cloudFunctions, db } from "../lib/firebase";
import {
  DEFAULT_ASSESSMENT_TYPE,
  getAssessmentMaxScore,
  normalizeAssessmentType,
} from "../lib/assessmentTypes";

const STORAGE_KEY = "resultpilot.session";
const ExamSessionContext = createContext(null);

export function ExamSessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedSession = sessionStorage.getItem(STORAGE_KEY);

    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [hydrated, session]);

  const startSession = (nextSession) => {
    setSession(nextSession);
    return nextSession;
  };

  const selectAnswer = (questionId, selected) => {
    setSession((current) => {
      if (!current) return current;

      return {
        ...current,
        answers: {
          ...current.answers,
          [questionId]: selected,
        },
      };
    });
  };

  const moveNext = () => {
    setSession((current) => {
      if (!current) return current;

      const nextIndex = Math.min(
        current.currentIndex + 1,
        current.questions.length - 1,
      );

      return {
        ...current,
        currentIndex: nextIndex,
      };
    });
  };

  const clearSession = () => {
    setSession(null);
  };

  const submitSession = async () => {
    if (!session || session.submittedResult) {
      return session?.submittedResult ?? null;
    }

    let result;

    if (usesFunctionExamFlow) {
      const submitExam = httpsCallable(cloudFunctions, "submitExam");
      const response = await submitExam({
        sessionId: session.sessionId,
        answers: session.answers,
      });
      result = response.data;
    } else {
      const submittedAtMs = Date.now();
      const reviewItems = session.questions.map((question) => {
        const selected = session.answers[question.id] ?? null;
        const correct = question.correctAnswer;

        return {
          questionId: question.id,
          questionText: question.questionText,
          options: question.options,
          selected,
          correct,
          isCorrect: selected === correct,
        };
      });

      const score = reviewItems.filter((item) => item.isCorrect).length;
      const total = reviewItems.length;
      const percentage = total ? Math.round((score / total) * 100) : 0;
      const timeTaken = Math.round((submittedAtMs - session.startedAt) / 1000);
      const passed = percentage >= session.exam.passmark;
      const assessmentType = normalizeAssessmentType(
        session.exam.assessmentType || DEFAULT_ASSESSMENT_TYPE,
      );
      const assessmentMaxScore = Number(
        session.exam.assessmentMaxScore || getAssessmentMaxScore(assessmentType),
      );

      result = {
        id: session.sessionId,
        studentName: session.student.fullName,
        studentId: session.student.id || "",
        class: session.student.className,
        classId: session.student.classId || "",
        school: session.student.schoolName,
        schoolId: session.student.schoolId || "",
        admissionNumber: session.student.admissionNumber || "",
        subject: session.exam.subject,
        academicSession: session.exam.academicSession || "Unspecified Session",
        term: session.exam.term || "Unspecified Term",
        examId: session.exam.id,
        examTitle: session.exam.title,
        assessmentType,
        assessmentMaxScore,
        score,
        total,
        percentage,
        timeTaken,
        passed,
        submittedAtMs,
        answers: reviewItems.map((item) => ({
          questionId: item.questionId,
          selected: item.selected,
          correct: item.correct,
        })),
        reviewItems,
      };

      await setDoc(doc(db, "results", session.sessionId), {
        studentName: result.studentName,
        studentId: result.studentId,
        class: result.class,
        classId: result.classId,
        school: result.school,
        schoolId: result.schoolId,
        admissionNumber: result.admissionNumber,
        subject: result.subject,
        academicSession: result.academicSession,
        term: result.term,
        examId: result.examId,
        examTitle: result.examTitle,
        assessmentType: result.assessmentType,
        assessmentMaxScore: result.assessmentMaxScore,
        score: result.score,
        total: result.total,
        percentage: result.percentage,
        timeTaken: result.timeTaken,
        passed: result.passed,
        answers: result.answers,
        submittedAt: serverTimestamp(),
        submittedAtMs,
      });
    }

    const nextSession = {
      ...session,
      submittedResult: result,
      status: "submitted",
    };

    setSession(nextSession);
    return result;
  };

  const value = {
    hydrated,
    session,
    hasActiveSession:
      Boolean(session) && session?.status === "in_progress" && !session?.submittedResult,
    hasResult: Boolean(session?.submittedResult),
    startSession,
    selectAnswer,
    moveNext,
    submitSession,
    clearSession,
  };

  return (
    <ExamSessionContext.Provider value={value}>
      {children}
    </ExamSessionContext.Provider>
  );
}

export function useExamSession() {
  const context = useContext(ExamSessionContext);

  if (!context) {
    throw new Error("useExamSession must be used within an ExamSessionProvider");
  }

  return context;
}
