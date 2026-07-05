import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

const ExamPage = lazy(() => import("./pages/ExamPage"));
const ResultsPage = lazy(() => import("./pages/ResultsPage"));
const StudentRegistrationPage = lazy(() => import("./pages/StudentRegistrationPage"));
const StudyAssistantPage = lazy(() => import("./pages/StudyAssistantPage"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const ManageSetupPage = lazy(() => import("./pages/admin/ManageSetupPage"));
const ManageExamsPage = lazy(() => import("./pages/admin/ManageExamsPage"));
const ManageQuestionsPage = lazy(() => import("./pages/admin/ManageQuestionsPage"));
const ManageStudyDocsPage = lazy(() => import("./pages/admin/ManageStudyDocsPage"));
const ResultsDashboardPage = lazy(() => import("./pages/admin/ResultsDashboardPage"));
const StudentLookupPage = lazy(() => import("./pages/admin/StudentLookupPage"));
const AdminTutorManagementPage = lazy(() => import("./pages/admin/AdminTutorManagementPage"));
const AdminSchoolAnalytics = lazy(() => import("./pages/admin/AdminSchoolAnalytics"));
const AcceptInvitePage = lazy(() => import("./pages/auth/AcceptInvitePage"));
const TutorLayout = lazy(() => import("./pages/tutor/TutorLayout"));
const TutorOverview = lazy(() => import("./pages/tutor/TutorOverview"));
const TutorExamList = lazy(() => import("./pages/tutor/TutorExamList"));
const TutorCreateExam = lazy(() => import("./pages/tutor/TutorCreateExam"));
const TutorExamDetail = lazy(() => import("./pages/tutor/TutorExamDetail"));
const TutorStudentList = lazy(() => import("./pages/tutor/TutorStudentList"));
const TutorResultList = lazy(() => import("./pages/tutor/TutorResultList"));
const TutorAnalytics = lazy(() => import("./pages/tutor/TutorAnalytics"));
const TheoryMarkingQueue = lazy(() => import("./pages/tutor/TheoryMarkingQueue"));

export default function App() {
  return (
    <Suspense fallback={<div className="centered-state">Loading...</div>}>
      <Routes>
        <Route path="/" element={<StudentRegistrationPage />} />
        <Route path="/study" element={<StudyAssistantPage />} />
        <Route
          path="/exam"
          element={
            <ProtectedRoute mode="session">
              <ExamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute mode="result">
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/auth/invite/:token" element={<AcceptInvitePage />} />
        <Route
          path="/tutor"
          element={
            <ProtectedRoute allowedRoles={["tutor"]}>
              <TutorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<TutorOverview />} />
          <Route path="exams" element={<TutorExamList />} />
          <Route path="exams/new" element={<TutorCreateExam />} />
          <Route path="exams/:examId" element={<TutorExamDetail />} />
          <Route path="students" element={<TutorStudentList />} />
          <Route path="results" element={<TutorResultList />} />
          <Route path="analytics" element={<TutorAnalytics />} />
          <Route path="marking" element={<TheoryMarkingQueue />} />
        </Route>
        <Route
          path="/admin"
          element={
            <ProtectedRoute mode="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="exams" replace />} />
          <Route path="setup" element={<ManageSetupPage />} />
          <Route path="exams" element={<ManageExamsPage />} />
          <Route path="questions" element={<ManageQuestionsPage />} />
          <Route path="study-docs" element={<ManageStudyDocsPage />} />
          <Route path="results" element={<ResultsDashboardPage />} />
          <Route path="students" element={<StudentLookupPage />} />
          <Route path="tutors" element={<AdminTutorManagementPage />} />
          <Route path="analytics" element={<AdminSchoolAnalytics />} />
          <Route path="marking" element={<TheoryMarkingQueue />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
