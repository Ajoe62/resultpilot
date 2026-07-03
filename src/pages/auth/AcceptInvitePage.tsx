import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { acceptInvite } from "../../lib/apiClient";

// Public page at /auth/invite/:token. The tutor sets a password; the server
// validates the token, creates the account + claims atomically, and returns the
// email so we can sign them straight in.
export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = (await acceptInvite({ token, password })) as {
        email: string;
        schoolId: string;
      };
      // Brand-new account — sign them in so their claims land in the token.
      await signInWithEmailAndPassword(auth, response.email, password);
      navigate("/tutor/overview", { replace: true });
    } catch (acceptError) {
      setError((acceptError as Error).message || "Unable to accept the invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="page-shell">
        <section className="auth-layout">
          <div className="card form-card">
            <p className="form-error">This invitation link is missing its token.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <section className="auth-layout">
        <div className="hero-copy">
          <span className="eyebrow">Tutor Invitation</span>
          <h1>Set your password to activate your account.</h1>
          <p>Once done, you'll be signed in and taken to your dashboard.</p>
        </div>

        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="section-heading">
            <h2>Accept Invitation</h2>
            <p>Choose a secure password (at least 8 characters).</p>
          </div>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your secure password"
            />
          </label>

          <label className="field">
            <span>Confirm Password</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Re-enter your password"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Activating..." : "Activate Account"}
          </button>
        </form>
      </section>
    </div>
  );
}
