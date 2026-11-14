"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Exam, toDatetimeLocalValue } from "@/features/exams/domain";

type FieldErrors = Record<string, string>;

type Props = {
  mode: "create" | "edit";
  exam?: Exam;
};

export default function ExamForm({ mode, exam }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(exam?.title ?? "");
  const [description, setDescription] = useState(exam?.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(exam ? String(exam.durationMinutes) : "");
  const [openAt, setOpenAt] = useState(toDatetimeLocalValue(exam?.openAt ?? null));
  const [closeAt, setCloseAt] = useState(toDatetimeLocalValue(exam?.closeAt ?? null));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const canEdit = useMemo(() => (mode === "create" ? true : exam?.status === "DRAFT"), [mode, exam]);

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = "Please enter an exam title.";
    const duration = Number(durationMinutes);
    if (durationMinutes.trim() === "") {
      next.durationMinutes = "Please enter a duration in minutes.";
    } else if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration <= 0) {
      next.durationMinutes = "Duration must be a positive whole number.";
    }
    if (openAt && closeAt) {
      const o = new Date(openAt).getTime();
      const c = new Date(closeAt).getTime();
      if (Number.isFinite(o) && Number.isFinite(c) && c <= o) {
        next.closeAt = "Close time must be after open time.";
      }
    }
    return next;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(null);
    const clientErrors = validateClient();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    if (!canEdit) return;

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        durationMinutes: Number(durationMinutes),
        openAt: openAt || null,
        closeAt: closeAt || null,
      };

      const res = await fetch(mode === "create" ? "/api/exams" : `/api/exams/${exam!.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setErrors(data.errors as FieldErrors);
        } else {
          setErrors({ form: data?.error || "Unable to save the exam. Please try again." });
        }
        return;
      }

      if (mode === "create") {
        router.push(`/exams/${data.exam.id}?created=1`);
        router.refresh();
      } else {
        setSaved("Exam details saved.");
        router.refresh();
      }
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card form-card" noValidate>
      {errors.form ? (
        <div className="error-message" role="alert">{errors.form}</div>
      ) : null}
      {saved ? <div className="success-message">{saved}</div> : null}

      <div className="field">
        <label htmlFor="title">Exam title <span aria-hidden="true">*</span></label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Midterm Exam - Math 10"
          disabled={!canEdit || submitting}
          required
        />
        {errors.title ? <div className="field-error">{errors.title}</div> : null}
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description (optional)"
          rows={3}
          disabled={!canEdit || submitting}
        />
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="durationMinutes">Duration (minutes) <span aria-hidden="true">*</span></label>
          <input
            id="durationMinutes"
            type="number"
            min={1}
            step={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="e.g. 45"
            disabled={!canEdit || submitting}
            required
          />
          {errors.durationMinutes ? <div className="field-error">{errors.durationMinutes}</div> : null}
        </div>
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="openAt">Open time</label>
          <input
            id="openAt"
            type="datetime-local"
            value={openAt}
            onChange={(e) => setOpenAt(e.target.value)}
            disabled={!canEdit || submitting}
          />
          <div className="field-help">Optional. Uses your local time.</div>
          {errors.openAt ? <div className="field-error">{errors.openAt}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="closeAt">Close time</label>
          <input
            id="closeAt"
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            disabled={!canEdit || submitting}
          />
          <div className="field-help">Optional. Must be after open time.</div>
          {errors.closeAt ? <div className="field-error">{errors.closeAt}</div> : null}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={() => router.push("/exams")} disabled={submitting}>
          Back to exams
        </button>
        {canEdit ? (
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Save draft" : "Save changes"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
