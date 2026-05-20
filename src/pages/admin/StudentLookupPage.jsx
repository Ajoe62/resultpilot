import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { formatDateValue, normalizeText } from "../../lib/utils";

export default function StudentLookupPage() {
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const resultsQuery = query(
      collection(db, "results"),
      orderBy("submittedAt", "desc"),
    );
    const unsubscribe = onSnapshot(resultsQuery, (snapshot) => {
      setResults(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })),
      );
    });

    return unsubscribe;
  }, []);

  const filteredResults = results.filter((result) =>
    normalizeText(result.studentName || "").includes(normalizeText(deferredSearch)),
  );

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Student Lookup</h2>
        <p>Search a student by name and review all attempts across subjects.</p>
      </div>

      <div className="card filters-card">
        <label className="field">
          <span>Student Name</span>
          <input
            value={search}
            onChange={(event) =>
              startTransition(() => setSearch(event.target.value))
            }
            placeholder="Type a student name"
          />
        </label>
      </div>

      <div className="card list-card">
        <div className="stack-list">
          {filteredResults.map((result) => (
            <article className="stack-list__item" key={result.id}>
              <div>
                <strong>{result.studentName}</strong>
                {result.admissionNumber ? <p>{result.admissionNumber}</p> : null}
                <p>
                  {result.subject} · {result.score}/{result.total} (
                  {result.percentage}%)
                </p>
                <small>
                  {result.school} · {result.class} · {formatDateValue(result.submittedAt)}
                </small>
              </div>
              <span className={result.passed ? "status-pill status-pill--pass" : "status-pill status-pill--fail"}>
                {result.passed ? "Passed" : "Failed"}
              </span>
            </article>
          ))}
          {!filteredResults.length ? (
            <p className="muted-text">No attempts found for that student name.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
