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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
