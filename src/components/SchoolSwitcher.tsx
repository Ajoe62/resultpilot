import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { createSchool } from "../lib/apiClient";

// Owner school switcher: pick the active school (scopes all data), and create a
// new school self-service (server adds it to the owner's claims).
export default function SchoolSwitcher() {
  const { role, schoolId, manageableSchools, switchSchool } = useAuth();
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    async function loadNames() {
      const entries = await Promise.all(
        manageableSchools.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "schools", id));
            return [id, snap.exists() ? snap.data().name || id : id] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );
      if (active) setNames(Object.fromEntries(entries));
    }
    if (manageableSchools.length) loadNames();
    return () => {
      active = false;
    };
  }, [manageableSchools]);

  if (role !== "schooladmin") return null;

  const submitNew = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (name.trim().length < 2) {
      setError("Enter a school name.");
      return;
    }
    setBusy(true);
    try {
      await createSchool({ name: name.trim() });
      // Refresh the ID token so the new schoolId claim is picked up (AuthContext
      // re-resolves via onIdTokenChanged), then the school appears below.
      if (auth.currentUser) await auth.currentUser.getIdToken(true);
      setName("");
      setAdding(false);
      setStatus("School created. Select it below to start managing it.");
    } catch (err) {
      setError((err as Error).message || "Could not create school.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="school-switcher">
      {manageableSchools.length > 1 ? (
        <label className="field">
          <span>Active School</span>
          <select value={schoolId || ""} onChange={(e) => switchSchool(e.target.value)}>
            {manageableSchools.map((id) => (
              <option key={id} value={id}>{names[id] || id}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted-text">School: {names[schoolId || ""] || schoolId || "—"}</p>
      )}

      {status ? <p className="muted-text">{status}</p> : null}

      {adding ? (
        <form onSubmit={submitNew}>
          <label className="field">
            <span>New school name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Annex" />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button className="secondary-button" type="button" onClick={() => { setAdding(false); setError(""); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="secondary-button" type="button" onClick={() => { setAdding(true); setStatus(""); }}>
          + Add School
        </button>
      )}
    </div>
  );
}
