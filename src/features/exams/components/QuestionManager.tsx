"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exam, McqOption, McqQuestion } from "@/features/exams/domain";

type FieldErrors = Record<string, string>;

type DraftOption = { id: string; content: string };

type Props = {
  exam: Exam;
};

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newOption(): DraftOption {
  return { id: generateId(), content: "" };
}

function toDraftOptions(options: McqOption[]): DraftOption[] {
  return options.map((o) => ({ id: o.id, content: o.content }));
}

function firstError(errors: FieldErrors): string | null {
  const keys = Object.keys(errors);
  return keys.length ? errors[keys[0]] : null;
}

export default function QuestionManager({ exam }: Props) {
  const router = useRouter();
  const isDraft = exam.status === "DRAFT";
  const mcqQuestions = useMemo(
    () => exam.questions.filter((q): q is McqQuestion => q.type === "MCQ"),
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
  const [options, setOptions] = useState<DraftOption[]>([newOption(), newOption()]);
  const [correctOptionId, setCorrectOptionId] = useState<string>("");

  function resetForm() {
    setPrompt("");
    setPoints("");
    const opts = [newOption(), newOption()];
    setOptions(opts);
    setCorrectOptionId("");
    setErrors({});
  }

  function startAdd() {
    setBanner(null);
    setEditingId(null);
    resetForm();
    setAdding(true);
  }

  function startEdit(q: McqQuestion) {
    setBanner(null);
    setAdding(false);
    setEditingId(q.id);
    setPrompt(q.prompt);
    setPoints(String(q.points));
    setOptions(toDraftOptions(q.options));
    setCorrectOptionId(q.correctOptionId);
    setErrors({});
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    resetForm();
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    if (!prompt.trim()) next.prompt = "Please enter the question text.";
    const p = Number(points);
    if (points.trim() === "") next.points = "Please enter points for this question.";
    else if (!Number.isFinite(p) || p <= 0) next.points = "Points must be a number greater than 0.";
    if (options.length < 2) next.optionsCount = "At least 2 options are required.";
    options.forEach((o, i) => {
      if (!o.content.trim()) next[`option_${i}`] = "Option text cannot be empty.";
    });
    if (!correctOptionId) next.correctOptionId = "Please select the correct answer.";
    else if (!options.some((o) => o.id === correctOptionId))
      next.correctOptionId = "The correct answer must be one of the options.";
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
        prompt: prompt.trim(),
        points: Number(points),
        options: options.map((o) => ({ id: o.id, content: o.content.trim() })),
        correctOptionId,
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
          setErrors({ form: data?.error || "Unable to save the question. Please try again." });
        }
        return;
      }
      setBanner(isEdit ? "Multiple-choice question updated." : "Multiple-choice question added.");
      cancelForm();
      router.refresh();
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(q: McqQuestion) {
    if (!isDraft) return;
    const ok = window.confirm(`Delete this multiple-choice question?\n\n"${q.prompt}"`);
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
      setBanner("Multiple-choice question deleted.");
      router.refresh();
    } catch {
      setErrors({ form: "Something went wrong while deleting the question." });
    } finally {
      setDeletingId(null);
    }
  }

  function updateOption(id: string, content: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, content } : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, newOption()]);
  }

  function removeOption(id: string) {
    setOptions((prev) => {
      const next = prev.filter((o) => o.id !== id);
      return next.length >= 2 ? next : prev;
    });
    if (correctOptionId === id) setCorrectOptionId("");
  }

  const formError = errors.form || (Object.keys(errors).length ? firstError(errors) : null);
  const showForm = adding || !!editingId;

  return (
    <div className="card question-section">
      <div className="question-header">
        <div>
          <h2>Multiple-choice questions</h2>
          <p className="muted">Add single-answer questions for automatic grading.</p>
        </div>
        {isDraft && !showForm ? (
          <button type="button" className="primary-btn" onClick={startAdd}>+ Add MCQ</button>
        ) : null}
      </div>

      {banner ? <div className="success-message">{banner}</div> : null}
      {!showForm && formError ? <div className="error-message" role="alert">{formError}</div> : null}

      {showForm ? (
        <form onSubmit={onSubmit} className="mcq-form" noValidate>
          <h3>{editingId ? "Edit multiple-choice question" : "Add multiple-choice question"}</h3>
          {errors.form ? <div className="error-message" role="alert">{errors.form}</div> : null}

          <div className="field">
            <label htmlFor="q-prompt">Question text <span aria-hidden="true">*</span></label>
            <textarea
              id="q-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Enter the question..."
              disabled={submitting}
            />
            {errors.prompt ? <div className="field-error">{errors.prompt}</div> : null}
          </div>

          <div className="field">
            <label htmlFor="q-points">Points <span aria-hidden="true">*</span></label>
            <input
              id="q-points"
              type="number"
              min={0.01}
              step={0.25}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="e.g. 1"
              disabled={submitting}
            />
            {errors.points ? <div className="field-error">{errors.points}</div> : null}
          </div>

          <div className="field">
            <label>Options <span aria-hidden="true">*</span> (select one correct answer)</label>
            <div className="options-list">
              {options.map((opt, idx) => (
                <div key={opt.id} className={`option-row ${correctOptionId === opt.id ? "correct" : ""}`}>
                  <input
                    type="radio"
                    name="correctOption"
                    checked={correctOptionId === opt.id}
                    onChange={() => setCorrectOptionId(opt.id)}
                    disabled={submitting}
                    aria-label={`Mark option ${idx + 1} as correct`}
                    title="Correct answer"
                  />
                  <input
                    type="text"
                    value={opt.content}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeOption(opt.id)}
                    disabled={submitting || options.length <= 2}
                    title={options.length <= 2 ? "At least 2 options are required" : "Remove option"}
                    aria-label={`Remove option ${idx + 1}`}
                  >
                    ×
                  </button>
                  {errors[`option_${idx}`] ? <div className="field-error option-error">{errors[`option_${idx}`]}</div> : null}
                </div>
              ))}
            </div>
            {errors.optionsCount ? <div className="field-error">{errors.optionsCount}</div> : null}
            {errors.correctOptionId ? <div className="field-error">{errors.correctOptionId}</div> : null}
            <button type="button" className="secondary-btn small-btn" onClick={addOption} disabled={submitting}>
              + Add option
            </button>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={cancelForm} disabled={submitting}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Save changes" : "Save question"}
            </button>
          </div>
        </form>
      ) : null}

      {mcqQuestions.length === 0 ? (
        <div className="empty-inline muted">No multiple-choice questions yet.{isDraft ? " Click “Add MCQ” to create one." : ""}</div>
      ) : (
        <ol className="question-list">
          {mcqQuestions.map((q, idx) => {
            const correct = q.options.find((o) => o.id === q.correctOptionId);
            return (
              <li key={q.id} className="question-item">
                <div className="question-item-head">
                  <div className="question-index">Question {idx + 1}</div>
                  <div className="question-meta">
                    <span className="pill">MCQ</span>
                    <span className="pill">{q.points} pts</span>
                    <span className="pill">{q.options.length} options</span>
                  </div>
                </div>
                <div className="question-prompt">{q.prompt}</div>
                <ul className="question-options">
                  {q.options.map((o) => (
                    <li key={o.id} className={o.id === q.correctOptionId ? "is-correct" : ""}>
                      <span className="opt-mark" aria-hidden="true">{o.id === q.correctOptionId ? "✓" : "•"}</span>
                      <span>{o.content}</span>
                      {o.id === q.correctOptionId ? <span className="correct-tag">Correct</span> : null}
                    </li>
                  ))}
                </ul>
                {!correct ? <div className="field-error">Warning: correct answer not set.</div> : null}
                {isDraft ? (
                  <div className="question-actions">
                    <button type="button" className="secondary-btn small-btn" onClick={() => startEdit(q)} disabled={submitting || deletingId === q.id}>Edit</button>
                    <button type="button" className="danger-btn small-btn" onClick={() => onDelete(q)} disabled={submitting || deletingId === q.id}>
                      {deletingId === q.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
