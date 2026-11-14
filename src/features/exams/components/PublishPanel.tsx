"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exam } from "@/features/exams/domain";

type Props = {
  exam: Exam;
};

type FieldErrors = Record<string, string>;

export default function PublishPanel({ exam }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [copied, setCopied] = useState<string | null>(null);

  const isPublished = exam.status === "PUBLISHED";
  const hasQuestions = (exam.questions?.length ?? 0) >= 1;
  const reasons = useMemo(() => {
    const list: string[] = [];
    if (!exam.title?.trim()) list.push("A valid exam title is required.");
    if (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0) {
      list.push("A valid duration is required.");
    }
    if (!hasQuestions) list.push("Add at least one question before publishing.");
    return list;
  }, [exam, hasQuestions]);

  const joinPath = exam.joinCode ? `/join/${exam.joinCode}` : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = joinPath ? `${origin}${joinPath}` : "";

  async function onPublish() {
    if (isPublished) return;
    const ok = window.confirm(
      "Publish this exam? Publishing will make it available to candidates and lock further content edits.",
    );
    if (!ok) return;

    setPublishing(true);
    setErrors({});
    try {
      const res = await fetch(`/api/exams/${exam.id}/publish`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setErrors(data.errors as FieldErrors);
        } else {
          setErrors({ form: data?.error || "Unable to publish the exam. Please try again." });
        }
        return;
      }
      router.refresh();
    } catch {
      setErrors({ form: "Something went wrong while publishing. Please try again." });
    } finally {
      setPublishing(false);
    }
  }

  async function copy(text: string, label: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800);
    } catch {
      setCopied("Unable to copy automatically. Please copy it manually.");
      window.setTimeout(() => setCopied(null), 2200);
    }
  }

  const errorMessages = Object.values(errors).filter(Boolean);

  return (
    <div className="card question-section">
      <div className="question-header">
        <div>
          <h2>Publish & join details</h2>
          <p className="muted">Publish the exam so candidates can join using the code or link.</p>
        </div>
        <span className={`status-badge ${isPublished ? "published" : "draft"}`}>
          {isPublished ? "Published" : "Draft"}
        </span>
      </div>

      {copied ? <div className="success-message">{copied}</div> : null}
      {errorMessages.length > 0 ? (
        <div className="error-message" role="alert">
          <strong>Unable to publish:</strong>
          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
            {errorMessages.map((m, i) => (
              <li key={`${i}-${m}`}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isPublished ? (
        <div className="publish-draft">
          <div className="publish-conditions">
            <h3>Ready to publish</h3>
            <ul className="checklist">
              <li>{exam.title?.trim() ? "✓" : "○"} Valid exam configuration</li>
              <li>{hasQuestions ? "✓" : "○"} At least 1 question (current: {exam.questions?.length ?? 0})</li>
            </ul>
            {reasons.length > 0 ? (
              <div className="muted" style={{ marginTop: 8 }}>{reasons.join(" ")}</div>
            ) : null}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={onPublish}
              disabled={publishing || reasons.length > 0}
              title={reasons.length > 0 ? "Meet the requirements before publishing" : "Publish exam"}
            >
              {publishing ? "Publishing..." : "Publish exam"}
            </button>
          </div>
        </div>
      ) : (
        <div className="publish-success">
          <div className="success-message" style={{ marginBottom: 12 }}>
            This exam is published and ready for candidates.
          </div>

          <div className="join-info-grid">
            <div className="field">
              <label>Join code</label>
              <div className="join-code-box">
                <code className="join-code">{exam.joinCode ?? "—"}</code>
                <button
                  type="button"
                  className="secondary-btn small-btn"
                  onClick={() => copy(exam.joinCode ?? "", "Join code copied.")}
                  disabled={!exam.joinCode}
                >
                  Copy code
                </button>
              </div>
            </div>
            <div className="field">
              <label>Join link</label>
              <div className="join-code-box">
                <input type="text" readOnly value={joinUrl || joinPath} aria-label="Join link" />
                <button
                  type="button"
                  className="secondary-btn small-btn"
                  onClick={() => copy(joinUrl || joinPath, "Join link copied.")}
                  disabled={!joinPath}
                >
                  Copy link
                </button>
              </div>
              <div className="field-help">Path: <code>{joinPath || "—"}</code></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
