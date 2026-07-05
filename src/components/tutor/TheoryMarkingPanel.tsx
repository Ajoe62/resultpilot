import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { finaliseTheory } from "../../lib/apiClient";
import type { SubAnswer, TheoryAnswer, TheorySubmission } from "../../types/theory";

interface QMeta {
  questionText?: string;
  markingScheme?: unknown;
  sampleAnswer?: string;
  subQuestions?: { id: string; text?: string; maxMarks?: number; markingScheme?: string }[];
}

function clamp(value: unknown, maxMarks: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxMarks || 0, n));
}

function schemeText(scheme: unknown): string {
  if (scheme && typeof scheme === "object") {
    const s = scheme as { content?: string; structure?: string; language?: string };
    return [s.content && `Content: ${s.content}`, s.structure && `Structure: ${s.structure}`, s.language && `Language: ${s.language}`]
      .filter(Boolean)
      .join(" · ");
  }
  return String(scheme || "");
}

interface Props {
  submission: TheorySubmission;
  onClose: () => void;
  onFinalised: () => void;
}

export default function TheoryMarkingPanel({ submission, onClose, onFinalised }: Props) {
  const [answers, setAnswers] = useState<TheoryAnswer[]>(() => structuredCloneSafe(submission.answers || []));
  const [questions, setQuestions] = useState<Record<string, QMeta>>({});
  const [mcq, setMcq] = useState({ score: 0, total: 0 });
  const [passmark, setPassmark] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [resultSnap, examSnap, qSnap] = await Promise.all([
          getDoc(doc(db, "results", submission.resultId)),
          submission.examId ? getDoc(doc(db, "exams", submission.examId)) : Promise.resolve(null),
          submission.examId ? getDocs(collection(db, "exams", submission.examId, "questions")) : Promise.resolve(null),
        ]);
        if (!active) return;
        if (resultSnap.exists()) {
          const r = resultSnap.data();
          setMcq({ score: Number(r.mcqScore ?? r.score ?? 0), total: Number(r.mcqTotal ?? r.total ?? 0) });
        }
        if (examSnap && examSnap.exists()) setPassmark(Number(examSnap.data().passmark) || 0);
        if (qSnap) {
          const map: Record<string, QMeta> = {};
          qSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.kind === "theory") map[d.id] = data;
          });
          setQuestions(map);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [submission.resultId, submission.examId]);

  const scoreOf = (answer: TheoryAnswer): number => {
    if (answer.type === "structured") {
      return (answer.subAnswers || []).reduce((sum, sub) => sum + clamp(sub.tutorScore ?? sub.finalScore ?? 0, sub.maxMarks), 0);
    }
    return clamp(answer.tutorScore ?? answer.finalScore ?? 0, answer.maxMarks);
  };
  const isMarked = (answer: TheoryAnswer): boolean => {
    if (answer.type === "structured") {
      return (answer.subAnswers || []).every((sub) => sub.tutorScore != null || sub.finalScore != null);
    }
    return answer.tutorScore != null || answer.finalScore != null;
  };

  const theoryAwarded = useMemo(() => answers.reduce((sum, a) => sum + scoreOf(a), 0), [answers]);
  const theoryTotal = submission.theoryTotal ?? answers.reduce((s, a) => s + (a.maxMarks || 0), 0);
  const allMarked = answers.every(isMarked);
  const combinedScore = mcq.score + theoryAwarded;
  const combinedTotal = mcq.total + theoryTotal;
  const combinedPct = combinedTotal ? Math.round((combinedScore / combinedTotal) * 100) : 0;
  const passed = combinedPct >= passmark;

  const update = (index: number, changes: Partial<TheoryAnswer>) =>
    setAnswers((cur) => cur.map((a, i) => (i === index ? { ...a, ...changes } : a)));
  const updateSub = (index: number, subId: string, changes: Partial<SubAnswer>) =>
    setAnswers((cur) =>
      cur.map((a, i) =>
        i === index ? { ...a, subAnswers: (a.subAnswers || []).map((s) => (s.subQuestionId === subId ? { ...s, ...changes } : s)) } : a,
      ),
    );

  const acceptAll = () =>
    setAnswers((cur) =>
      cur.map((a) => {
        if (a.type === "structured") {
          return { ...a, subAnswers: (a.subAnswers || []).map((s) => ({ ...s, tutorScore: clamp(s.ai?.suggestedScore ?? 0, s.maxMarks) })) };
        }
        if (a.reviewStatus === "auto_marked") return a;
        return { ...a, tutorScore: clamp(a.ai?.suggestedScore ?? 0, a.maxMarks) };
      }),
    );

  const persist = async (status: TheorySubmission["status"]) => {
    await updateDoc(doc(db, "theorySubmissions", submission.id), { answers, status });
  };

  const saveProgress = async () => {
    setError("");
    setBusy("save");
    try {
      await persist("in_review");
    } catch (e) {
      setError((e as Error).message || "Unable to save.");
    } finally {
      setBusy("");
    }
  };

  const doFinalise = async () => {
    setError("");
    setBusy("finalise");
    try {
      await persist("in_review"); // write current marks first
      await finaliseTheory(submission.id); // server clamps + combines + releases
      onFinalised();
    } catch (e) {
      setError((e as Error).message || "Unable to finalise.");
      setConfirming(false);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="admin-section">
      <div className="section-heading">
        <h2>Marking — {submission.studentName}</h2>
        <p>
          {submission.examTitle} · Section A: {mcq.score}/{mcq.total} · Section B: {theoryAwarded}/{theoryTotal}
        </p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="button-row">
        <button className="secondary-button" type="button" onClick={onClose}>← Back to queue</button>
        <button className="secondary-button" type="button" onClick={acceptAll}>Accept all AI scores</button>
        <button className="secondary-button" type="button" disabled={busy === "save"} onClick={saveProgress}>
          {busy === "save" ? "Saving…" : "Save progress"}
        </button>
        <button className="primary-button" type="button" disabled={!allMarked || busy === "finalise"} onClick={() => setConfirming(true)}>
          Finalise & release
        </button>
      </div>

      {answers.map((answer, index) => {
        const meta = questions[answer.questionId] || {};
        return (
          <div className="card" key={answer.questionId}>
            <div className="section-heading">
              <h3>Question {index + 1} <span className="muted-text">[{answer.maxMarks} marks]</span></h3>
            </div>
            <p><strong>{meta.questionText || answer.questionId}</strong></p>
            {schemeText(meta.markingScheme) ? <p className="muted-text">Marking scheme: {schemeText(meta.markingScheme)}</p> : null}

            {answer.type === "structured" ? (
              (answer.subAnswers || []).map((sub, si) => {
                const subMeta: { text?: string; maxMarks?: number; markingScheme?: string } =
                  (meta.subQuestions || []).find((s) => s.id === sub.subQuestionId) || {};
                return (
                  <div className="card" key={sub.subQuestionId} style={{ padding: "0.6rem" }}>
                    <p><strong>({String.fromCharCode(97 + si)}) {subMeta.text || ""}</strong> <span className="muted-text">[{sub.maxMarks} marks]</span></p>
                    {subMeta.markingScheme ? <p className="muted-text">Scheme: {subMeta.markingScheme}</p> : null}
                    <p><em>Answer:</em> {sub.studentAnswer || <span className="muted-text">(no answer)</span>}</p>
                    {sub.ai ? <p className="muted-text">AI: {sub.ai.suggestedScore}/{sub.maxMarks} ({sub.ai.confidence}) — {sub.ai.reasoning}</p> : null}
                    <div className="field-grid">
                      <input type="number" min="0" max={sub.maxMarks} placeholder="Score"
                        value={sub.tutorScore ?? ""} onChange={(e) => updateSub(index, sub.subQuestionId, { tutorScore: Number(e.target.value) })} />
                      {sub.ai ? <button className="secondary-button" type="button" onClick={() => updateSub(index, sub.subQuestionId, { tutorScore: clamp(sub.ai?.suggestedScore ?? 0, sub.maxMarks) })}>Accept AI</button> : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <>
                <p><em>Answer:</em> {answer.studentAnswer || <span className="muted-text">(no answer)</span>}</p>
                {answer.reviewStatus === "auto_marked" ? (
                  <p className="muted-text">Auto-graded (fill in the blank): {answer.finalScore}/{answer.maxMarks}</p>
                ) : answer.ai ? (
                  <p className="muted-text">AI suggestion: {answer.ai.suggestedScore}/{answer.maxMarks} ({answer.ai.confidence}) — {answer.ai.reasoning}</p>
                ) : null}
                <div className="field-grid">
                  <input type="number" min="0" max={answer.maxMarks} placeholder="Score"
                    value={answer.tutorScore ?? answer.finalScore ?? ""} onChange={(e) => update(index, { tutorScore: Number(e.target.value) })} />
                  {answer.ai ? <button className="secondary-button" type="button" onClick={() => update(index, { tutorScore: clamp(answer.ai?.suggestedScore ?? 0, answer.maxMarks) })}>Accept AI</button> : null}
                </div>
                <label className="field">
                  <span>Comment (optional)</span>
                  <input value={answer.tutorComment ?? ""} onChange={(e) => update(index, { tutorComment: e.target.value })} />
                </label>
              </>
            )}
          </div>
        );
      })}

      {confirming ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel card">
            <h3>Release results for {submission.studentName}?</h3>
            <p>Section A: {mcq.score}/{mcq.total} · Section B: {theoryAwarded}/{theoryTotal}</p>
            <p><strong>Combined: {combinedScore}/{combinedTotal} ({combinedPct}%) — {passed ? "PASSED" : "FAILED"}</strong></p>
            <p className="muted-text">This releases the student's final result and cannot be undone here.</p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="button-row">
              <button className="primary-button" type="button" disabled={busy === "finalise"} onClick={doFinalise}>
                {busy === "finalise" ? "Releasing…" : "Confirm & release"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function structuredCloneSafe(value: TheoryAnswer[]): TheoryAnswer[] {
  return JSON.parse(JSON.stringify(value ?? []));
}
