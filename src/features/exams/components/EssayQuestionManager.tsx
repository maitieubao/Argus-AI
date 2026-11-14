"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EssayQuestion, Exam, RubricCriterion } from "@/features/exams/domain";

type FieldErrors = Record<string, string>;

type DraftCriterion = { id: string; name: string; description: string; maxScore: string };

type Props = {
  exam: Exam;
};

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `crit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newCriterion(): DraftCriterion {
  return { id: generateId(), name: "", description: "", maxScore: "" };
}

function toDraftCriteria(criteria: RubricCriterion[]): DraftCriterion[] {
  return criteria.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    maxScore: String(c.maxScore),
  }));
}

function firstError(errors: FieldErrors): string | null {
  const keys = Object.keys(errors);
  return keys.length ? errors[keys[0]] : null;
}

function parseScore(value: string): number {
  if (value.trim() === "") return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export default function EssayQuestionManager({ exam }: Props) {
  const router = useRouter();
  const isDraft = exam.status === "DRAFT";
  const essayQuestions = useMemo(
    () => exam.questions.filter((q): q is EssayQuestion => q.type === "ESSAY"),
    [exam.questions],
  );

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState("");
  const [criteria, setCriteria] = useState<DraftCriterion[]>([newCriterion()]);

  function resetForm() {
    setPrompt("");
    setPoints("");
    setCriteria([newCriterion()]);
    setErrors({});
  }

  function startAdd() {
    setBanner(null);
    setEditingId(null);
    resetForm();
    setAdding(true);
  }

  function startEdit(q: EssayQuestion) {
    setBanner(null);
    setAdding(false);
    setEditingId(q.id);
    setPrompt(q.prompt);
    setPoints(String(q.points));
    setCriteria(toDraftCriteria(q.rubricCriteria));
    setErrors({});
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    resetForm();
  }

  const rubricSum = useMemo(
    () => criteria.reduce((sum, c) => sum + (Number.isFinite(parseScore(c.maxScore)) ? parseScore(c.maxScore) : 0), 0),
    [criteria],
  );
  const questionPointsNum = parseScore(points);
  const sumMatches =
    Number.isFinite(questionPointsNum) &&
    questionPointsNum > 0 &&
    criteria.length > 0 &&
    Math.abs(rubricSum - questionPointsNum) < 0.001;

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    if (!prompt.trim()) next.prompt = "Please enter the essay prompt.";
    const p = parseScore(points);
    if (points.trim() === "") next.points = "Please enter the maximum points for this question.";
    else if (!Number.isFinite(p) || p <= 0) next.points = "Points must be a number greater than 0.";

    if (criteria.length < 1) next.rubricCriteriaCount = "At least one rubric criterion is required.";
    let computedSum = 0;
    let criteriaHaveValueErrors = false;
    criteria.forEach((c, i) => {
      if (!c.name.trim()) next[`criteria_${i}_name`] = "Please enter a criterion name.";
      if (!c.description.trim()) next[`criteria_${i}_description`] = "Please enter a criterion description.";
      const ms = parseScore(c.maxScore);
      if (c.maxScore.trim() === "") {
        next[`criteria_${i}_maxScore`] = "Maximum score is required.";
        criteriaHaveValueErrors = true;
      } else if (!Number.isFinite(ms) || ms <= 0) {
        next[`criteria_${i}_maxScore`] = "Maximum score must be greater than 0.";
        criteriaHaveValueErrors = true;
      } else {
        computedSum += ms;
      }
    });

    if (Number.isFinite(p) && p > 0 && criteria.length >= 1 && !criteriaHaveValueErrors) {
      if (Math.abs(computedSum - p) > 0.001) {
        next.rubricSum = `Rubric total (${computedSum}) must equal the question points (${p}).`;
      }
    }
    return next;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBanner(null);
    const clientErrors = validateClient();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    if (!isDraft) return;

    setSubmitting(true);
    try {
      const payload = {
        type: "ESSAY",
        prompt: prompt.trim(),
        points: Number(points),
        rubricCriteria: criteria.map((c) => ({
          id: c.id,
          name: c.name.trim(),
          description: c.description.trim(),
          maxScore: Number(c.maxScore),
        })),
      };
      const isEdit = !!editingId;
      const url = isEdit
        ? `/api/exams/${exam.id}/questions/${editingId}`
        : `/api/exams/${exam.id}/questions`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setErrors(data.errors as FieldErrors);
        } else {
          setErrors({ form: data?.error || "Unable to save the essay question. Please try again." });
        }
        return;
      }
      setBanner(isEdit ? "Essay question updated." : "Essay question added.");
      cancelForm();
      router.refresh();
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(q: EssayQuestion) {
    if (!isDraft) return;
    const ok = window.confirm(`Delete this essay question?\n\n"${q.prompt}"`);
    if (!ok) return;
    setDeletingId(q.id);
    setBanner(null);
    setErrors({});
    try {
      const res = await fetch(`/api/exams/${exam.id}/questions/${q.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data?.errors || { form: "Unable to delete the question." });
        return;
      }
      if (editingId === q.id) cancelForm();
      setBanner("Essay question deleted.");
      router.refresh();
    } catch {
      setErrors({ form: "Something went wrong while deleting the question." });
    } finally {
      setDeletingId(null);
    }
  }

  function updateCriterion(id: string, field: keyof DraftCriterion, value: string) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function addCriterion() {
    setCriteria((prev) => [...prev, newCriterion()]);
  }

  function removeCriterion(id: string) {
    setCriteria((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  }

  const formError = errors.form || (Object.keys(errors).length ? firstError(errors) : null);
  const showForm = adding || !!editingId;

  return (
    <div className="card question-section">
      <div className="question-header">
        <div>
          <h2>Essay questions & rubric</h2>
          <p className="muted">Create essay prompts with rubric criteria for assisted grading.</p>
        </div>
        {isDraft && !showForm ? (
          <button type="button" className="primary-btn" onClick={startAdd}>+ Add essay</button>
        ) : null}
      </div>

      {banner ? <div className="success-message">{banner}</div> : null}
      {!showForm && formError ? <div className="error-message" role="alert">{formError}</div> : null}

      {showForm ? (
        <form onSubmit={onSubmit} className="mcq-form essay-form" noValidate>
          <h3>{editingId ? "Edit essay question" : "Add essay question"}</h3>
          {errors.form ? <div className="error-message" role="alert">{errors.form}</div> : null}

          <div className="field">
            <label htmlFor="e-prompt">Prompt <span aria-hidden="true">*</span></label>
            <textarea
              id="e-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Enter the essay prompt..."
              disabled={submitting}
            />
            {errors.prompt ? <div className="field-error">{errors.prompt}</div> : null}
          </div>

          <div className="field">
            <label htmlFor="e-points">Maximum points <span aria-hidden="true">*</span></label>
            <input
              id="e-points"
              type="number"
              min={0.01}
              step={0.25}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="e.g. 10"
              disabled={submitting}
            />
            {errors.points ? <div className="field-error">{errors.points}</div> : null}
          </div>

          <div className="field">
            <label>Rubric criteria <span aria-hidden="true">*</span></label>
            <p className="field-help">The sum of criterion scores must equal the question&apos;s maximum points.</p>

            <div className="criteria-list">
              {criteria.map((c, idx) => (
                <div key={c.id} className="criterion-card">
                  <div className="criterion-head">
                    <strong>Criterion {idx + 1}</strong>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeCriterion(c.id)}
                      disabled={submitting || criteria.length <= 1}
                      title={criteria.length <= 1 ? "At least one criterion is required" : "Remove criterion"}
                      aria-label={`Remove criterion ${idx + 1}`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="criterion-grid">
                    <div className="field">
                      <label htmlFor={`c-name-${c.id}`}>Name <span aria-hidden="true">*</span></label>
                      <input
                        id={`c-name-${c.id}`}
                        type="text"
                        value={c.name}
                        onChange={(e) => updateCriterion(c.id, "name", e.target.value)}
                        placeholder="e.g. Content quality"
                        disabled={submitting}
                      />
                      {errors[`criteria_${idx}_name`] ? <div className="field-error">{errors[`criteria_${idx}_name`]}</div> : null}
                    </div>
                    <div className="field">
                      <label htmlFor={`c-max-${c.id}`}>Max score <span aria-hidden="true">*</span></label>
                      <input
                        id={`c-max-${c.id}`}
                        type="number"
                        min={0.01}
                        step={0.25}
                        value={c.maxScore}
                        onChange={(e) => updateCriterion(c.id, "maxScore", e.target.value)}
                        placeholder="e.g. 4"
                        disabled={submitting}
                      />
                      {errors[`criteria_${idx}_maxScore`] ? <div className="field-error">{errors[`criteria_${idx}_maxScore`]}</div> : null}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`c-desc-${c.id}`}>Description <span aria-hidden="true">*</span></label>
                    <textarea
                      id={`c-desc-${c.id}`}
                      value={c.description}
                      onChange={(e) => updateCriterion(c.id, "description", e.target.value)}
                      rows={2}
                      placeholder="Describe how this criterion is evaluated..."
                      disabled={submitting}
                    />
                    {errors[`criteria_${idx}_description`] ? <div className="field-error">{errors[`criteria_${idx}_description`]}</div> : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="rubric-summary-row">
              <button type="button" className="secondary-btn small-btn" onClick={addCriterion} disabled={submitting}>+ Add criterion</button>
              <div className={`rubric-total ${sumMatches ? "ok" : points.trim() ? "warn" : ""}`}>
                Rubric total: <strong>{rubricSum}</strong>
                {points.trim() ? (
                  <>
                    {" "}/ Question points: <strong>{Number.isFinite(questionPointsNum) ? questionPointsNum : "—"}</strong>
                    {sumMatches ? " ✓" : ""}
                  </>
                ) : null}
              </div>
            </div>

            {errors.rubricCriteriaCount ? <div className="field-error">{errors.rubricCriteriaCount}</div> : null}
            {errors.rubricSum ? <div className="field-error">{errors.rubricSum}</div> : null}
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={cancelForm} disabled={submitting}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Save changes" : "Save essay question"}
            </button>
          </div>
        </form>
      ) : null}

      {essayQuestions.length === 0 ? (
        <div className="empty-inline muted">No essay questions yet.{isDraft ? " Click “Add essay” to create one." : ""}</div>
      ) : (
        <ol className="question-list">
          {essayQuestions.map((q) => (
            <li key={q.id} className="question-item essay-item">
              <div className="question-item-head">
                <div className="question-index">Question {q.order} (Essay)</div>
                <div className="question-meta">
                  <span className="pill">Essay</span>
                  <span className="pill">{q.points} pts</span>
                  <span className="pill">{q.rubricCriteria.length} criteria</span>
                </div>
              </div>
              <div className="question-prompt">{q.prompt}</div>
              <div className="rubric-view">
                <div className="rubric-view-title">Rubric</div>
                <ul className="rubric-view-list">
                  {q.rubricCriteria.map((c) => (
                    <li key={c.id} className="rubric-view-item">
                      <div className="rubric-view-top">
                        <strong>{c.name}</strong>
                        <span className="pill">{c.maxScore} pts</span>
                      </div>
                      {c.description ? <div className="rubric-view-desc">{c.description}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
              {isDraft ? (
                <div className="question-actions">
                  <button type="button" className="secondary-btn small-btn" onClick={() => startEdit(q)} disabled={submitting || deletingId === q.id}>Edit</button>
                  <button type="button" className="danger-btn small-btn" onClick={() => onDelete(q)} disabled={submitting || deletingId === q.id}>
                    {deletingId === q.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
