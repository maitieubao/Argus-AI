import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptById } from "@/features/attempts/store";
import { getProctoringSummaryByAttempt } from "@/features/proctoring/service";
import { getEventTypeLabel, isKnownEventType } from "@/features/proctoring/domain";
import ProctorEventReviewControls from "./ProctorEventReviewControls";

export const metadata = {
  title: "Attempt proctoring details | Argus AI",
};

function attemptStatusLabel(status: string, submitReason: string | null) {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "AUTO_SUBMITTED" || submitReason === "TIMEOUT") return "Auto-submitted (time expired)";
  return "Submitted";
}

function levelClass(level: string) {
  if (level === "HIGH") return "risk-high";
  if (level === "MEDIUM") return "risk-medium";
  if (level === "LOW") return "risk-low";
  return "risk-none";
}

function fmtEventTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDurationSeconds(ms?: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function getSnapshotDataUrl(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const dataUrl = meta.dataUrl;
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : null;
}

function renderMetadata(meta: Record<string, unknown> | null) {
  if (!meta) return "—";
  const parts: string[] = [];
  if (typeof meta.durationMs === "number") {
    parts.push(`duration: ${(meta.durationMs / 1000).toFixed(1)}s`);
  }
  if (typeof meta.confidence === "number") {
    parts.push(`confidence: ${Math.round(meta.confidence * 100)}%`);
  }
  for (const [k, v] of Object.entries(meta)) {
    if (
      k === "dataUrl" ||
      k === "durationMs" ||
      k === "confidence" ||
      k === "startTimestamp" ||
      k === "endTimestamp" ||
      k === "totalMonitoringDurationMs" ||
      k === "bothHandsVisibleDurationMs"
    ) {
      continue;
    }
    if (v == null || v === "") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}: ${String(v)}`);
    }
  }
  if (getSnapshotDataUrl(meta)) {
    parts.push("evidence snapshot attached");
  }
  return parts.length ? parts.join(" · ") : "—";
}

export default async function ExamAttemptProctoringPage({
  params,
}: {
  params: { id: string; attemptId: string };
}) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") redirect("/login");

  const exam = await getExamById(params.id);
  if (!exam) notFound();
  if (exam.ownerId !== session.user.id) redirect("/exams");

  const attempt = await getAttemptById(params.attemptId);
  if (!attempt || attempt.examId !== exam.id) notFound();

  const summaryResult = await getProctoringSummaryByAttempt(attempt.id);
  const summary = summaryResult.ok ? summaryResult.data : null;

  const countsEntries = summary ? Object.entries(summary.countsByType).sort((a, b) => b[1] - a[1]) : [];
  const snapshots = (summary?.events || []).filter((e) => getSnapshotDataUrl(e.metadata) !== null);
  const live = summary?.liveTelemetry ?? null;

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Proctoring: {attempt.candidate.fullName}</h1>
            <p className="muted">
              Exam: <strong>{exam.title}</strong> · Status: <strong>{attemptStatusLabel(attempt.status, attempt.submitReason)}</strong>
            </p>
            <p className="muted">
              Started: <strong>{formatDateTime(attempt.startedAt)}</strong> · Submitted: <strong>{formatDateTime(attempt.submittedAt)}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="secondary-btn link-btn">Grade</Link>
            <Link href={`/exams/${exam.id}/results`} className="secondary-btn link-btn">Results</Link>
            <Link href={`/exams/${exam.id}/proctoring`} className="secondary-btn link-btn">Proctoring list</Link>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam</Link>
          </div>
        </div>

        {!summary ? (
          <div className="card question-section">
            <div className="error-message">Unable to load proctoring data.</div>
          </div>
        ) : (
          <>
            {/* Phase 5.1: Live Monitoring Status Card */}
            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Live AI Monitoring Status</h2>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Real-time face, eye gaze, head pose, and hand visibility telemetry
                  </p>
                </div>
                <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>{summary.warningLabel}</span>
              </div>
              <div className="exam-info-block" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div>
                  Webcam status: <strong>{attempt.cameraCheck?.status ?? "not_checked"}</strong>
                </div>
                <div>
                  Face visibility:{" "}
                  <strong>
                    {!live
                      ? "—"
                      : live.cameraObstructed
                        ? "Obstructed"
                        : live.faceCount >= 2
                          ? `Multiple faces (${live.faceCount})`
                          : live.faceVisible
                            ? "Visible (1 face)"
                            : "Missing"}
                  </strong>
                </div>
                <div>
                  Eye gaze: <strong>{live ? live.eyeGazeDirection : "—"}</strong>
                </div>
                <div>
                  Head pose:{" "}
                  <strong>
                    {live ? `${live.headOrientation} (yaw ${live.yaw}°, pitch ${live.pitch}°)` : "—"}
                  </strong>
                </div>
                <div>
                  Left hand: <strong>{live ? (live.leftHandVisible ? "Visible" : "Missing") : "—"}</strong>
                </div>
                <div>
                  Right hand: <strong>{live ? (live.rightHandVisible ? "Visible" : "Missing") : "—"}</strong>
                </div>
                <div>
                  Monitored time: <strong>{live ? fmtDurationSeconds(live.totalMonitoringDurationMs) : "—"}</strong>
                </div>
                <div>
                  Hands visible time: <strong>{live ? fmtDurationSeconds(live.bothHandsVisibleDurationMs) : "—"}</strong>
                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Summary</h2>
                </div>
              </div>
              <div className="exam-info-block" style={{ marginBottom: 10 }}>
                <div>
                  Total events: <strong>{summary.totalEvents}</strong> · Reviewed: <strong>{summary.reviewedCount}</strong> · Unresolved: <strong>{summary.unresolvedCount}</strong>
                </div>
                <div>
                  First event: <strong>{summary.firstEventAt ? fmtEventTime(summary.firstEventAt) : "—"}</strong> · Last event: <strong>{summary.lastEventAt ? fmtEventTime(summary.lastEventAt) : "—"}</strong>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Reasons</div>
                {summary.warningReasons.length ? (
                  <ul style={{ marginLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                    {summary.warningReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted">No notable signals.</div>
                )}
              </div>
            </div>

            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Events by type</h2>
                </div>
              </div>
              {countsEntries.length === 0 ? (
                <div className="empty-state">No proctoring events recorded for this attempt.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countsEntries.map(([type, count]) => (
                        <tr key={type}>
                          <td data-label="Type"><code>{type}</code></td>
                          <td data-label="Description">{isKnownEventType(type) ? getEventTypeLabel(type) : type}</td>
                          <td data-label="Count"><strong>{count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Evidence & Camera Snapshots</h2>
                </div>
              </div>
              {snapshots.length === 0 ? (
                <div className="muted">No evidence snapshots recorded.</div>
              ) : (
                <div className="snapshot-grid">
                  {snapshots.map((e) => {
                    const dataUrl = getSnapshotDataUrl(e.metadata);
                    if (!dataUrl) return null;
                    return (
                      <div key={e.id} className="snapshot-item">
                        {/* eslint-disable-next-line @next/next/no-img-element -- snapshot is a stored data URL */}
                        <img src={dataUrl} alt={`Evidence for ${e.type}`} />
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                          <code>{e.type}</code>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {fmtEventTime(e.occurredAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Camera check status: <strong>{attempt.cameraCheck?.status ?? "not_checked"}</strong>
                {attempt.cameraCheck?.note ? ` — ${attempt.cameraCheck.note}` : ""}
              </div>
            </div>

            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Event timeline & Human Review</h2>
                </div>
              </div>
              {summary.events.length === 0 ? (
                <div className="empty-state">No proctoring events recorded.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Metadata & Duration</th>
                        <th>Review Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.events.map((e) => (
                        <tr key={e.id}>
                          <td data-label="Time">{fmtEventTime(e.occurredAt)}</td>
                          <td data-label="Type"><code>{e.type}</code></td>
                          <td data-label="Description">{getEventTypeLabel(e.type)}</td>
                          <td data-label="Metadata" className="muted" style={{ fontSize: 13 }}>
                            {renderMetadata(e.metadata as Record<string, unknown> | null)}
                          </td>
                          <td data-label="Review Status">
                            <ProctorEventReviewControls
                              examId={exam.id}
                              attemptId={attempt.id}
                              eventId={e.id}
                              initialStatus={e.reviewStatus ?? "DETECTED"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
