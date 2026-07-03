import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useExamSession } from "../context/ExamSessionContext";

// Where each role lands when it hits a route it isn't allowed on.
const DEFAULT_ROUTE_BY_ROLE = {
  schooladmin: "/admin",
  tutor: "/tutor/overview",
};

export default function ProtectedRoute({ children, mode, allowedRoles }) {
  const { currentUser, isAdmin, role, loading } = useAuth();
  const { hydrated, hasActiveSession, hasResult } = useExamSession();
  const location = useLocation();

  // Role-based guard (multi-tenant routes). Enforcement is defence-in-depth on
  // top of Firestore rules — never the only boundary.
  if (allowedRoles) {
    if (loading) {
      return <div className="centered-state">Checking authentication...</div>;
    }
    if (!currentUser) {
      return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }
    if (!allowedRoles.includes(role)) {
      const fallback = DEFAULT_ROUTE_BY_ROLE[role] || "/admin/login";
      return <Navigate to={fallback} replace />;
    }
    return children;
  }

  // --- existing behavior (unchanged) ---
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
