"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResultsPublishControls({
  examId,
  attemptId,
  published,
  gradingComplete,
  submitted,
}: {
  examId: string;
  attemptId: string;
  published: boolean;
  gradingComplete: boolean;
  submitted: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(nextPublished: boolean) {
    if (!submitted) return;
    if (nextPublished && !gradingComplete) {
      const ok = window.confirm(
        "Essay grading is not fully finalized for this attempt. Publishing now will show provisional scores based on finalized grading only. Continue?",
      );
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/result`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: nextPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.errors?.form || data?.errors?.published || "Unable to update publish status.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while updating publish status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <button
        type="button"
        className={published ? "secondary-btn small-btn" : "primary-btn small-btn"}
        onClick={() => void toggle(!published)}
        disabled={loading || !submitted}
        style={{ width: "100%" }}
      >
        {loading ? "Updating…" : published ? "Unpublish result" : "Publish result"}
      </button>
      {error ? <div className="error-message" style={{ fontSize: 12, margin: 0, padding: "6px 8px" }}>{error}</div> : null}
    </div>
  );
}
