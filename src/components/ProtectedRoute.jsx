import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useExamSession } from "../context/ExamSessionContext";

export default function ProtectedRoute({ children, mode }) {
  const { currentUser, isAdmin, loading } = useAuth();
  const { hydrated, hasActiveSession, hasResult } = useExamSession();
  const location = useLocation();

  if (loading && mode === "admin") {
    return <div className="centered-state">Checking authentication...</div>;
  }

  if (!hydrated && (mode === "session" || mode === "result")) {
    return <div className="centered-state">Restoring session...</div>;
  }

  if (mode === "admin" && (!currentUser || !isAdmin)) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (mode === "session" && !hasActiveSession) {
    return <Navigate to="/" replace />;
  }

  if (mode === "result" && !hasResult) {
    return <Navigate to="/" replace />;
  }

  return children;
}
