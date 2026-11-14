"use client";

import { useMemo, useState } from "react";
import type { Exam, EssayQuestion } from "@/features/exams/domain";
import type { Attempt } from "@/features/attempts/domain";
import type {
  AiEssaySuggestion,
  EssayGradingSummary,
  EssayQuestionGrading,
} from "@/features/essay-grading/domain";

type ContextPayload = {
  exam: Exam;
  attempt: Attempt;
  essayQuestions: EssayQuestion[];
  records: EssayQuestionGrading[];
  summary: EssayGradingSummary;
};

type Props = {
  examId: string;
  attemptId: string;
  initial: ContextPayload;
};

type CriterionDraft = { criterionId: string; score: string; comment: string };

type QuestionDraft = {
  criteria: CriterionDraft[];
  overallComment: string;
};

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function statusLabel(s: string) {
  if (s === "PENDING") return "Pending";
  if (s === "SUGGESTED") return "Suggested";
  if (s === "DRAFT") return "Draft";
  if (s === "FINALIZED") return "Finalized";
  return s;
}

function aiStatusLabel(s?: AiEssaySuggestion["status"]) {
  if (s === "success") return "Suggestion available";
  if (s === "unavailable") return "AI unavailable";
  if (s === "error") return "AI error";
  return "No suggestion";
}

function buildDraft(question: EssayQuestion, record: EssayQuestionGrading | undefined): QuestionDraft {
  const evaln = record?.teacherEvaluation;
  const from = evaln?.criteria;
  const byId = new Map((from || []).map((c) => [c.criterionId, c]));
  return {
    criteria: question.rubricCriteria
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const f = byId.get(c.id);
        return {
          criterionId: c.id,
          score: f && Number.isFinite(f.score) ? String(f.score) : "",
          comment: f?.comment || "",
        };
      }),
    overallComment: evaln?.overallComment || "",
  };
}

export default function EssayGradingWorkspace({ examId, attemptId, initial }: Props) {
  const [ctx, setCtx] = useState<ContextPayload>(initial);
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>(() => {
    const d: Record<string, QuestionDraft> = {};
    const byQ = new Map(initial.records.map((r) => [r.questionId, r]));
    for (const q of initial.essayQuestions) d[q.id] = buildDraft(q, byQ.get(q.id));
    return d;
  });
  const [busy, setBusy] = useState<Record<string, "suggest" | "save" | "finalize" | null>>({});
  const [messages, setMessages] = useState<Record<string, { type: "success" | "error"; text: string } | null>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  const recordByQ = useMemo(() => new Map(ctx.records.map((r) => [r.questionId, r])), [ctx.records]);

  function updateDraft(questionId: string, updater: (d: QuestionDraft) => QuestionDraft) {
    setDrafts((prev) => ({ ...prev, [questionId]: updater(prev[questionId]) }));
  }

  function applySuggestion(question: EssayQuestion) {
    const rec = recordByQ.get(question.id);
    const sug = rec?.aiSuggestion;
    if (!sug || sug.status !== "success" || !Array.isArray(sug.criteria)) return;
    const byId = new Map(sug.criteria.map((c) => [c.criterionId, c]));
    setDrafts((prev) => ({
      ...prev,
      [question.id]: {
        criteria: question.rubricCriteria
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((c) => {
            const sc = byId.get(c.id);
            return {
              criterionId: c.id,
              score: sc && Number.isFinite(sc.score) ? String(sc.score) : "",
              comment: sc?.comment || "",
            };
          }),
        overallComment: sug.overallComment || prev[question.id]?.overallComment || "",
      },
    }));
    setMessages((m) => ({ ...m, [question.id]: { type: "success", text: "AI suggestion applied to the form (not saved)." } }));
  }

  function computeDraftTotal(question: EssayQuestion, draft: QuestionDraft): number {
    let sum = 0;
    for (const c of draft.criteria) {
      const n = Number(c.score);
      if (Number.isFinite(n)) sum += n;
    }
    return Math.min(question.points, Math.max(0, round(sum)));
  }

  async function refresh() {
    const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/grading`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.errors?.form || "Unable to load grading data.");
    setCtx(data as ContextPayload);
    return data as ContextPayload;
  }

  async function suggest(questionId: string) {
    setBusy((b) => ({ ...b, [questionId]: "suggest" }));
    setMessages((m) => ({ ...m, [questionId]: null }));
    try {
      const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/grading/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((m) => ({ ...m, [questionId]: { type: "error", text: data?.errors?.form || "Unable to generate AI suggestion." } }));
        return;
      }
      await refresh();
      const st = data?.record?.aiSuggestion?.status;
      if (st === "success") {
        setMessages((m) => ({ ...m, [questionId]: { type: "success", text: "AI suggestion generated." } }));
      } else if (st === "unavailable") {
        setMessages((m) => ({ ...m, [questionId]: { type: "error", text: data?.record?.aiSuggestion?.error || "AI is not available." } }));
      } else {
        setMessages((m) => ({ ...m, [questionId]: { type: "error", text: data?.record?.aiSuggestion?.error || "Unable to generate AI suggestion." } }));
      }
    } catch {
      setMessages((m) => ({ ...m, [questionId]: { type: "error", text: "Network error while generating suggestion." } }));
    } finally {
      setBusy((b) => ({ ...b, [questionId]: null }));
    }
  }

  async function save(question: EssayQuestion, finalize: boolean) {
    if (finalize) {
      const ok = window.confirm("Finalize the score for this essay question?");
      if (!ok) return;
    }
    setBusy((b) => ({ ...b, [question.id]: finalize ? "finalize" : "save" }));
    setMessages((m) => ({ ...m, [question.id]: null }));
    setErrors((e) => ({ ...e, [question.id]: {} }));
    const draft = drafts[question.id];
    try {
      const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/grading`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          finalize,
          evaluation: {
            criteria: draft.criteria.map((c) => ({ criterionId: c.criterionId, score: c.score === "" ? "" : Number(c.score), comment: c.comment })),
            overallComment: draft.overallComment,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldErrors = (data?.errors || {}) as Record<string, string>;
        setErrors((e) => ({ ...e, [question.id]: fieldErrors }));
        setMessages((m) => ({ ...m, [question.id]: { type: "error", text: fieldErrors.form || "Unable to save evaluation." } }));
        return;
      }
      const next = await refresh();
      const rec = (next.records || []).find((r: EssayQuestionGrading) => r.questionId === question.id);
      if (rec) {
        setDrafts((prev) => ({ ...prev, [question.id]: buildDraft(question, rec) }));
      }
      setMessages((m) => ({ ...m, [question.id]: { type: "success", text: finalize ? "Essay score finalized." : "Draft saved." } }));
    } catch {
      setMessages((m) => ({ ...m, [question.id]: { type: "error", text: "Network error while saving evaluation." } }));
    } finally {
      setBusy((b) => ({ ...b, [question.id]: null }));
    }
  }

  const { attempt, essayQuestions, summary } = ctx;

  return (
    <div className="grading-workspace">
      <div className="card question-section">
        <div className="question-section-head" style={{ marginBottom: 8 }}>
          <div>
            <h2>Summary</h2>
          </div>
          <span className={`status-badge ${summary.allEssaysFinalized ? "published" : "draft"}`}>
            {summary.essayTotalCount === 0 ? "No essays" : summary.allEssaysFinalized ? "All essays finalized" : `${summary.essayFinalizedCount}/${summary.essayTotalCount} finalized`}
          </span>
        </div>
        <div className="exam-info-block" style={{ marginBottom: 0 }}>
          <div>MCQ: <strong>{summary.mcqEarned}/{summary.mcqPossible}</strong></div>
          <div>Essay (finalized): <strong>{summary.essayEarned}/{summary.essayPossible}</strong></div>
          <div>Total (MCQ + finalized essay): <strong>{summary.overallEarned}/{summary.overallPossible}</strong></div>
          <div>Status: <strong>{summary.overallGradingStatus}</strong></div>
        </div>
      </div>

      {essayQuestions.length === 0 ? (
        <div className="card question-section"><div className="empty-state">No essay questions for this attempt.</div></div>
      ) : null}

      {essayQuestions.map((q, idx) => {
        const rec = recordByQ.get(q.id);
        const draft = drafts[q.id] || buildDraft(q, rec);
        const qBusy = busy[q.id] || null;
        const msg = messages[q.id] || null;
        const fieldErrors = errors[q.id] || {};
        const sug = rec?.aiSuggestion || null;
        const evaln = rec?.teacherEvaluation || null;
        const qStatus = evaln?.status === "FINALIZED" ? "FINALIZED" : evaln?.status === "DRAFT" ? "DRAFT" : sug?.status === "success" ? "SUGGESTED" : "PENDING";
        const draftTotal = computeDraftTotal(q, draft);
        const answer = attempt.answers.find((a) => a.questionId === q.id && a.type === "ESSAY");
        const answerText = answer && answer.type === "ESSAY" ? answer.text : "";

        return (
          <div key={q.id} className="card question-section grading-question-card">
            <div className="question-section-head" style={{ marginBottom: 8, alignItems: "flex-start" }}>
              <div>
                <h2>Essay {idx + 1}</h2>
                <p className="muted" style={{ marginTop: 2 }}>Max points: <strong>{q.points}</strong> · Status: <strong>{statusLabel(qStatus)}</strong></p>
              </div>
              <span className={`status-badge ${qStatus === "FINALIZED" ? "published" : qStatus === "DRAFT" ? "draft" : ""}`}>
                {statusLabel(qStatus)}
              </span>
            </div>

            <div className="grading-block">
              <div className="grading-block-title">Prompt</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{q.prompt}</div>
            </div>

            <div className="grading-block">
              <div className="grading-block-title">Rubric</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Criterion</th><th>Description</th><th>Max points</th></tr></thead>
                  <tbody>
                    {q.rubricCriteria.slice().sort((a,b)=>a.order-b.order).map((c) => (
                      <tr key={c.id}><td><strong>{c.name}</strong></td><td style={{ whiteSpace: "pre-wrap" }}>{c.description || "—"}</td><td>{c.maxScore}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grading-block">
              <div className="grading-block-title">Candidate answer</div>
              <div className="answer-box">{answerText && answerText.trim() ? answerText : <em className="muted">(No answer)</em>}</div>
            </div>

            <div className="grading-block">
              <div className="grading-block-title" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span>AI suggestion</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: 13 }}>{aiStatusLabel(sug?.status)}{sug?.generatedAt ? ` · ${new Date(sug.generatedAt).toLocaleString("en-US")}` : ""}</span>
                  <button type="button" className="secondary-btn small-btn" onClick={() => suggest(q.id)} disabled={!!qBusy}>
                    {qBusy === "suggest" ? "Generating..." : sug ? "Regenerate" : "Generate suggestion"}
                  </button>
                </div>
              </div>
              {!sug ? (
                <div className="muted">No AI suggestion yet.</div>
              ) : sug.status === "success" ? (
                <div className="ai-suggestion-box">
                  <div style={{ marginBottom: 8 }}><strong>Suggested total:</strong> {sug.suggestedTotal ?? "—"} / {q.points}</div>
                  <div className="table-wrap" style={{ marginBottom: 8 }}>
                    <table>
                      <thead><tr><th>Criterion</th><th>Suggested score</th><th>Comment</th></tr></thead>
                      <tbody>
                        {q.rubricCriteria.slice().sort((a,b)=>a.order-b.order).map((c) => {
                          const sc = (sug.criteria || []).find((x) => x.criterionId === c.id);
                          return <tr key={c.id}><td>{c.name} <span className="muted">(max {c.maxScore})</span></td><td>{sc ? sc.score : "—"}</td><td style={{ whiteSpace: "pre-wrap" }}>{sc?.comment || "—"}</td></tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                  {sug.overallComment ? <div style={{ marginBottom: 6 }}><strong>Overall comment:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{sug.overallComment}</span></div> : null}
                  {Array.isArray(sug.strengths) && sug.strengths.length ? <div style={{ marginBottom: 6 }}><strong>Strengths:</strong><ul style={{ marginLeft: 18 }}>{sug.strengths.map((s, i)=><li key={i}>{s}</li>)}</ul></div> : null}
                  {Array.isArray(sug.improvements) && sug.improvements.length ? <div style={{ marginBottom: 6 }}><strong>Improvements:</strong><ul style={{ marginLeft: 18 }}>{sug.improvements.map((s, i)=><li key={i}>{s}</li>)}</ul></div> : null}
                  <button type="button" className="secondary-btn small-btn" onClick={() => applySuggestion(q)}>Apply suggestion</button>
                </div>
              ) : (
                <div className="error-message" role="status">
                  {sug.status === "unavailable" ? "AI unavailable: " : "AI error: "}
                  {sug.error || "Please grade manually."}
                </div>
              )}
            </div>

            <div className="grading-block">
              <div className="grading-block-title">Teacher evaluation</div>
              {evaln?.status === "FINALIZED" ? (
                <div className="success-message" style={{ marginBottom: 8 }}>Finalized {evaln.finalizedAt ? `at ${new Date(evaln.finalizedAt).toLocaleString("en-US")}` : ""}.</div>
              ) : null}
              {fieldErrors.form ? <div className="error-message" style={{ marginBottom: 8 }}>{fieldErrors.form}</div> : null}
              {msg ? <div className={msg.type === "error" ? "error-message" : "success-message"} style={{ marginBottom: 8 }}>{msg.text}</div> : null}

              <div className="table-wrap" style={{ marginBottom: 10 }}>
                <table>
                  <thead><tr><th>Criterion</th><th style={{ width: 140 }}>Score (0..max)</th><th>Comment</th></tr></thead>
                  <tbody>
                    {q.rubricCriteria.slice().sort((a,b)=>a.order-b.order).map((c, ci) => {
                      const cd = draft.criteria[ci];
                      const ferr = fieldErrors[`criterion_${c.id}`];
                      return (
                        <tr key={c.id}>
                          <td><strong>{c.name}</strong><div className="muted" style={{ fontSize: 12 }}>Max: {c.maxScore}</div></td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={c.maxScore}
                              step="0.25"
                              value={cd?.score ?? ""}
                              onChange={(e) => updateDraft(q.id, (d) => { const nd = { ...d, criteria: d.criteria.slice() }; nd.criteria[ci] = { ...nd.criteria[ci], score: e.target.value }; return nd; })}
                              style={{ width: "100%" }}
                            />
                            {ferr ? <div className="field-error" style={{ marginTop: 4 }}>{ferr}</div> : null}
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={cd?.comment ?? ""}
                              onChange={(e) => updateDraft(q.id, (d) => { const nd = { ...d, criteria: d.criteria.slice() }; nd.criteria[ci] = { ...nd.criteria[ci], comment: e.target.value }; return nd; })}
                              style={{ width: "100%" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="form-grid" style={{ marginBottom: 10 }}>
                <div className="field">
                  <label>Total score</label>
                  <input type="text" value={`${draftTotal} / ${q.points}`} readOnly />
                  {fieldErrors.totalScore ? <div className="field-error">{fieldErrors.totalScore}</div> : null}
                </div>
                <div className="field">
                  <label>Overall comment (optional)</label>
                  <textarea rows={3} value={draft.overallComment} onChange={(e) => updateDraft(q.id, (d) => ({ ...d, overallComment: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="secondary-btn" onClick={() => save(q, false)} disabled={!!qBusy}>
                  {qBusy === "save" ? "Saving..." : "Save draft"}
                </button>
                <button type="button" className="primary-btn" onClick={() => save(q, true)} disabled={!!qBusy}>
                  {qBusy === "finalize" ? "Finalizing..." : "Finalize"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
