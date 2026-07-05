import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import QuestionEditor from "../../components/exams/QuestionEditor";
import TheoryQuestionBuilder from "../../components/exams/TheoryQuestionBuilder";

// Admin question management now delegates to the shared QuestionEditor (add /
// edit / delete + AI generation), keeping only the exam picker here. Same
// behavior and same Firestore writes as before.
export default function ManageQuestionsPage() {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "exams"),
      (snapshot) => {
        const nextExams = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .filter((exam) => !exam.isArchived);
        setExams(nextExams);
        setSelectedExamId((current) => {
          if (!nextExams.length) return "";
          if (current && nextExams.some((exam) => exam.id === current)) return current;
          return nextExams[0].id;
        });
      },
      (snapshotError) => setError(snapshotError.message),
    );

    return unsubscribe;
  }, []);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId);

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Manage Questions</h2>
        <p>Attach multiple-choice questions to any exam.</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="card form-card">
        <label className="field">
          <span>Select Exam</span>
          <select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
            <option value="">Select an exam</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title} ({exam.subject})
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedExamId ? (
        <>
          <QuestionEditor examId={selectedExamId} showAiGenerator subject={selectedExam?.subject} />
          <TheoryQuestionBuilder examId={selectedExamId} exam={selectedExam} />
        </>
      ) : (
        <p className="muted-text">Create an exam first, then select it here to add questions.</p>
      )}
    </section>
  );
}
