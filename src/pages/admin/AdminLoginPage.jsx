import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, enableNetwork, getDoc } from "firebase/firestore";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../../lib/firebase";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const destination = location.state?.from?.pathname || "/admin/exams";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credentialsResult = await signInWithEmailAndPassword(
        auth,
        credentials.email.trim(),
        credentials.password,
      );

      await enableNetwork(db);
      const adminSnapshot = await getDoc(doc(db, "admins", credentialsResult.user.uid));

      if (!adminSnapshot.exists()) {
        await auth.signOut();
        setError("This account is not authorized for admin access.");
        return;
      }

      navigate(destination, { replace: true });
    } catch (loginError) {
      if (loginError?.message?.includes("client is offline")) {
        setError(
          "Unable to verify admin because Firestore is offline. Check your network or emulator connection.",
        );
      } else if (loginError?.code === "permission-denied") {
        setError(
          "Unable to verify admin access. Make sure this Firebase Auth user has an /admins/{uid} document.",
        );
      } else {
        setError(loginError.message || "Unable to sign in.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <section className="auth-layout">
        <div className="hero-copy">
          <span className="eyebrow">Admin Access</span>
          <h1>Manage exams, questions, and student performance.</h1>
          <p>Use your Firebase Authentication email and password.</p>
        </div>

        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Tutor Login</h2>
            <p>Only authenticated admins can manage exam content.</p>
          </div>

          <label className="field">
            <span>Email Address</span>
            <input
              name="email"
              type="email"
              value={credentials.email}
              onChange={(event) =>
                setCredentials((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="tutor@example.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              value={credentials.password}
              onChange={(event) =>
                setCredentials((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="Your secure password"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </section>
    </div>
  );
}
