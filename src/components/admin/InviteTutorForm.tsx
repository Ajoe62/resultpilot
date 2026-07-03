import { useState } from "react";
import type { FormEvent } from "react";
import { inviteTutor } from "../../lib/apiClient";
import { useClasses } from "../../hooks/useClasses";

interface InviteResult {
  inviteLink: string;
  emailed: boolean;
}

// Admin form to invite a tutor: name, email, and the classes they'll manage.
// The invite token + email are handled server-side (/api/admin/invite-tutor).
export default function InviteTutorForm() {
  const { classes, loading: classesLoading } = useClasses();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);

  const toggleClass = (classId: string) => {
    setSelectedClasses((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const response = (await inviteTutor({
        name: name.trim(),
        email: email.trim(),
        assignedClasses: selectedClasses,
      })) as InviteResult;
      setResult(response);
      setName("");
      setEmail("");
      setSelectedClasses([]);
    } catch (inviteError) {
      setError((inviteError as Error).message || "Unable to send invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h3>Invite a Tutor</h3>
        <p>They'll receive a link to set a password and activate their account.</p>
      </div>

      <label className="field">
        <span>Full Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Jane Doe"
        />
      </label>

      <label className="field">
        <span>Email Address</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jane@example.com"
        />
      </label>

      <div className="field">
        <span>Assigned Classes</span>
        {classesLoading ? (
          <p className="muted-text">Loading classes...</p>
        ) : classes.length === 0 ? (
          <p className="muted-text">No classes yet. Create classes in School Setup first.</p>
        ) : (
          <div className="stack-list">
            {classes.map((classItem) => (
              <label className="checkbox-row" key={classItem.id}>
                <input
                  type="checkbox"
                  checked={selectedClasses.includes(classItem.id)}
                  onChange={() => toggleClass(classItem.id)}
                />
                <span>{classItem.name || classItem.id}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {result ? (
        <div className="muted-text">
          <p>
            Invitation created{result.emailed ? " and emailed." : ". Email is not configured — share this link:"}
          </p>
          {!result.emailed ? (
            <p>
              <a href={result.inviteLink}>{result.inviteLink}</a>
            </p>
          ) : null}
        </div>
      ) : null}

      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Sending..." : "Send Invitation"}
      </button>
    </form>
  );
}
