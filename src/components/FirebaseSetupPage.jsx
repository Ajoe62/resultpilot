import { REQUIRED_FIREBASE_ENV_KEYS } from "../lib/env";

export default function FirebaseSetupPage({ issues }) {
  return (
    <div className="page-shell">
      <section className="card setup-card">
        <div className="section-heading">
          <h1>Firebase Setup Required</h1>
          <p>
            The app started, but the Firebase environment variables are missing or
            still using placeholder values.
          </p>
        </div>

        <div className="setup-copy">
          <p>
            Create or update the local <code>.env</code> file in the project root
            with your real Firebase web app configuration values.
          </p>
          <p>Required keys:</p>
          <ul className="plain-list">
            {REQUIRED_FIREBASE_ENV_KEYS.map((key) => (
              <li key={key}>
                <code>{key}</code>
                {issues.includes(key) ? " (needs attention)" : ""}
              </li>
            ))}
          </ul>
          <p>
            After updating <code>.env</code>, restart the dev server.
          </p>
        </div>
      </section>
    </div>
  );
}
