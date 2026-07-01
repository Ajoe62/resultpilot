import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ACCEPTED_EXTENSIONS, extractText } from "../../lib/documentExtract";
import { deleteStudyDocument, ingestDocument } from "../../lib/apiClient";
import { formatDateValue } from "../../lib/utils";

// Tutors upload source material (curriculum, textbook chapter, past paper).
// Text is extracted in the browser, then embedded + stored server-side so it
// powers both the student study assistant and source-grounded question sets.
export default function ManageStudyDocsPage() {
  const [exams, setExams] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [examId, setExamId] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "exams"), (snapshot) => {
      setExams(
        snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter((exam) => !exam.isArchived),
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const documentsQuery = query(
      collection(db, "studyDocuments"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      documentsQuery,
      (snapshot) => {
        setDocuments(
          snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
        );
      },
      (snapshotError) => setError(snapshotError.message),
    );
    return unsubscribe;
  }, []);

  const resetForm = () => {
    setTitle("");
    setSubject("");
    setExamId("");
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!title.trim()) {
      setError("A document title is required.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setBusy(true);
    try {
      setStatus("Extracting text from the document...");
      const text = await extractText(file);
      if (!text || text.trim().length < 40) {
        throw new Error(
          "Could not extract enough text. Scanned/image-only PDFs are not supported.",
        );
      }

      setStatus("Embedding and storing the document...");
      const linkedExam = exams.find((exam) => exam.id === examId);
      const result = await ingestDocument({
        title: title.trim(),
        subject: subject.trim() || linkedExam?.subject || "",
        examId,
        text,
      });

      setStatus(
        `Stored "${title.trim()}" (${result.chunkCount} chunks${result.truncated ? ", truncated" : ""}).`,
      );
      resetForm();
    } catch (uploadError) {
      setError(uploadError.message || "Upload failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (documentId) => {
    setError("");
    setStatus("");
    try {
      await deleteStudyDocument(documentId);
      setStatus("Document deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete document.");
    }
  };

  const examTitleById = (id) => exams.find((exam) => exam.id === id)?.title || "";

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Study Documents</h2>
        <p>
          Upload source material. Students can ask questions grounded in it, and you
          can generate exam questions straight from it.
        </p>
      </div>

      <div className="admin-grid">
        <form className="card form-card" onSubmit={handleUpload}>
          <div className="section-heading">
            <h3>Upload Document</h3>
            <p>PDF, DOCX, TXT, or Markdown. Text-based files only (no scanned images).</p>
          </div>

          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Biology - Chapter 4: Cells"
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Subject (optional)</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Biology"
              />
            </label>

            <label className="field">
              <span>Link to Exam (optional)</span>
              <select value={examId} onChange={(event) => setExamId(event.target.value)}>
                <option value="">Not linked</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} ({exam.subject})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>File</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          <p className="muted-text">
            Linking to an exam lets students taking that exam use the study assistant.
          </p>

          {error ? <p className="form-error">{error}</p> : null}
          {status ? <p className="muted-text">{status}</p> : null}

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Working..." : "Upload & Ingest"}
            </button>
          </div>
        </form>

        <div className="card list-card">
          <div className="section-heading">
            <h3>Uploaded Documents</h3>
            <p>{documents.length} documents</p>
          </div>
          <div className="stack-list">
            {documents.map((document) => (
              <article className="stack-list__item" key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <p>
                    {document.subject || "No subject"}
                    {document.examId ? ` - Exam: ${examTitleById(document.examId)}` : " - Not linked"}
                    {" - "}
                    {document.chunkCount || 0} chunks
                  </p>
                  <small>Added {formatDateValue(document.createdAt)}</small>
                </div>
                <div className="button-row">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => handleDelete(document.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {!documents.length ? (
              <p className="muted-text">No documents uploaded yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
