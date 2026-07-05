import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const NAV_ITEMS = [
  { label: "School Setup", path: "/admin/setup" },
  { label: "Manage Exams", path: "/admin/exams" },
  { label: "Manage Questions", path: "/admin/questions" },
  { label: "Study Documents", path: "/admin/study-docs" },
  { label: "Results Dashboard", path: "/admin/results" },
  { label: "Student Lookup", path: "/admin/students" },
  { label: "Tutors", path: "/admin/tutors" },
  { label: "Theory Marking", path: "/admin/marking" },
  { label: "School Analytics", path: "/admin/analytics" },
];

export default function AdminLayout() {
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
          <h1>Admin Dashboard</h1>
          <p>Signed in as {currentUser?.email}</p>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "sidebar-link--active" : ""}`
              }
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
        <Outlet />
      </main>
    </div>
  );
}
