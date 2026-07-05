// Renders one theory question's answer input by type. Answers flow up to the
// ExamSession (persisted to sessionStorage on every change, so a refresh keeps
// them). Word limits are soft warnings, never hard blocks — mirrors real exams.

type TheoryType = "short_answer" | "essay" | "fill_blank" | "structured";

interface ClientTheoryQuestion {
  id: string;
  type: TheoryType;
  questionText: string;
  maxMarks: number;
  wordLimit?: number;
  sentence?: string;
  subQuestions?: { id: string; text: string; maxMarks: number }[];
}

interface TheoryValue {
  studentAnswer?: string;
  subAnswers?: Record<string, string>;
}

interface Props {
  index: number;
  question: ClientTheoryQuestion;
  value: TheoryValue;
  onChange: (studentAnswer: string) => void;
  onSubChange: (subQuestionId: string, value: string) => void;
}

function countWords(text?: string): number {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function WordCounter({ text, limit }: { text?: string; limit?: number }) {
  const count = countWords(text);
  let warning = "";
  if (limit) {
    if (count > limit) warning = ` · over the ${limit}-word limit`;
    else if (count >= limit * 0.9) warning = ` · approaching the ${limit}-word limit`;
  }
  return (
    <small className={warning ? "form-error" : "muted-text"}>
      {count} word{count === 1 ? "" : "s"}
      {limit ? ` / ${limit}` : ""}
      {warning}
    </small>
  );
}

export default function TheoryAnswerInput({ index, question, value, onChange, onSubChange }: Props) {
  const marks = `[${question.maxMarks} mark${question.maxMarks === 1 ? "" : "s"}]`;

  return (
    <article className="card question-block">
      <h3>
        Question {index + 1} <span className="muted-text">{marks}</span>
      </h3>

      {question.type === "fill_blank" ? (
        <FillBlank sentence={question.sentence || question.questionText} value={value.studentAnswer || ""} onChange={onChange} />
      ) : (
        <p>{question.questionText}</p>
      )}

      {question.type === "short_answer" ? (
        <>
          <textarea rows={3} value={value.studentAnswer || ""} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" />
          <WordCounter text={value.studentAnswer} limit={question.wordLimit} />
        </>
      ) : null}

      {question.type === "essay" ? (
        <>
          <textarea rows={10} value={value.studentAnswer || ""} onChange={(e) => onChange(e.target.value)} placeholder="Write your essay…" />
          <WordCounter text={value.studentAnswer} limit={question.wordLimit} />
        </>
      ) : null}

      {question.type === "structured" ? (
        <div className="stack-list">
          {(question.subQuestions || []).map((sub, i) => (
            <div className="field" key={sub.id}>
              <span>
                ({String.fromCharCode(97 + i)}) {sub.text} <span className="muted-text">[{sub.maxMarks} mark{sub.maxMarks === 1 ? "" : "s"}]</span>
              </span>
              <textarea
                rows={3}
                value={(value.subAnswers || {})[sub.id] || ""}
                onChange={(e) => onSubChange(sub.id, e.target.value)}
                placeholder="Type your answer…"
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FillBlank({ sentence, value, onChange }: { sentence: string; value: string; onChange: (v: string) => void }) {
  const marker = sentence.indexOf("[BLANK]");
  if (marker < 0) {
    return (
      <div className="field">
        <p>{sentence}</p>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />
      </div>
    );
  }
  const before = sentence.slice(0, marker);
  const after = sentence.slice(marker + "[BLANK]".length);
  return (
    <p style={{ lineHeight: 2 }}>
      {before}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="answer"
        style={{ display: "inline-block", width: "12rem", margin: "0 0.35rem" }}
      />
      {after}
    </p>
  );
}
