"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatReviewStatusLabel, type ProctoringReviewStatus } from "@/features/proctoring/domain";

export default function ProctorEventReviewControls({
  examId,
  attemptId,
  eventId,
  initialStatus = "DETECTED",
}: {
  examId: string;
  attemptId: string;
  eventId: string;
  initialStatus?: ProctoringReviewStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProctoringReviewStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  async function updateStatus(targetStatus: "CONFIRMED" | "RESOLVED") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/proctoring/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetStatus }),
        },
      );
      if (res.ok) {
        setStatus(targetStatus);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span
        className={`status-badge ${status === "RESOLVED" ? "published" : "draft"}`}
        style={{ fontSize: 12 }}
      >
        {formatReviewStatusLabel(status)}
      </span>
      {status === "DETECTED" ? (
        <button
          type="button"
          className="secondary-btn small-btn"
          style={{ fontSize: 12, padding: "4px 10px" }}
          disabled={busy}
          onClick={() => void updateStatus("CONFIRMED")}
        >
          Flag issue
        </button>
      ) : null}
      {status !== "RESOLVED" ? (
        <button
          type="button"
          className="secondary-btn small-btn"
          style={{ fontSize: 12, padding: "4px 10px" }}
          disabled={busy}
          onClick={() => void updateStatus("RESOLVED")}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
