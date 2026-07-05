import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import NotificationBell from "../../components/NotificationBell";

const NAV_ITEMS = [
  { label: "Overview", path: "/tutor/overview" },
  { label: "My Exams", path: "/tutor/exams" },
  { label: "Students", path: "/tutor/students" },
  { label: "Results", path: "/tutor/results" },
  { label: "Marking", path: "/tutor/marking" },
  { label: "Analytics", path: "/tutor/analytics" },
];

export default function TutorLayout() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <span className="eyebrow">ResultPilot</span>
          <h1>Tutor Dashboard</h1>
          <p>Signed in as {currentUser?.email}</p>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link--active" : ""}`}
              key={item.path}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="secondary-button" onClick={handleLogout} type="button">
          Sign Out
        </button>
      </aside>

      <main className="admin-content">
        <div className="content-header">
          <NotificationBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
