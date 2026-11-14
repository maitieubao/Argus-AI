import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptById } from "@/features/attempts/store";
import { getProctoringSummaryByAttempt } from "@/features/proctoring/service";
import {
  type ProctoringEvent,
  formatCameraCheckStatus,
  formatDurationFriendly,
  formatFacePresence,
  formatGazeDirection,
  formatHandsVisibility,
  formatHeadOrientation,
  getEventTypeDescription,
  getEventTypeTitle,
  isKnownEventType,
} from "@/features/proctoring/domain";
import ProctorEventReviewControls from "./ProctorEventReviewControls";

export const metadata = {
  title: "Candidate monitoring report | Argus AI",
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

function getSnapshotDataUrl(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const dataUrl = meta.dataUrl;
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : null;
}

function renderFriendlyDetails(event: ProctoringEvent): string {
  const meta = event.metadata;
  const parts: string[] = [];

  if (meta) {
    if (typeof meta.durationMs === "number" && meta.durationMs > 0) {
      parts.push(`Lasted ${formatDurationFriendly(meta.durationMs)}`);
    }

    if (typeof meta.confidence === "number" && Number.isFinite(meta.confidence)) {
      const pct = Math.round(meta.confidence * 100);
      const level = pct >= 85 ? "High confidence" : pct >= 60 ? "Medium confidence" : "Low confidence";
      parts.push(`${level} (${pct}%)`);
    }

    if (event.type === "CAMERA_SNAPSHOT") {
      if (meta.reason === "session_start") parts.push("Taken when the exam started");
      else if (meta.reason === "visibility_hidden") parts.push("Taken when switching tabs");
      else if (meta.reason === "fullscreen_exit") parts.push("Taken when exiting fullscreen");
    }

    if (event.type === "CAMERA_STATUS") {
      if (meta.status === "monitoring_enabled") {
        parts.push("Webcam monitoring started");
      } else if (typeof meta.faceVisible === "boolean") {
        const presence = formatFacePresence({
          cameraObstructed: meta.cameraObstructed === true,
          faceCount: typeof meta.faceCount === "number" ? meta.faceCount : 1,
          faceVisible: meta.faceVisible,
        });
        const gaze =
          typeof meta.eyeGazeDirection === "string"
            ? formatGazeDirection(meta.eyeGazeDirection)
            : null;
        parts.push(gaze ? `${presence} · ${gaze}` : presence);
      }
    }

    if (event.type === "HEAD_TURNED" && typeof meta.headOrientation === "string") {
      parts.push(formatHeadOrientation(meta.headOrientation));
    }

    if (event.type === "LOOKING_AWAY" && typeof meta.eyeGazeDirection === "string") {
      parts.push(formatGazeDirection(meta.eyeGazeDirection));
    }

    if (event.type === "HANDS_MISSING") {
      const left = meta.leftHandVisible === true;
      const right = meta.rightHandVisible === true;
      parts.push(formatHandsVisibility(left, right));
    }

    if (event.type === "CAMERA_ERROR" && typeof meta.reason === "string" && meta.reason) {
      parts.push(`Reason: ${meta.reason}`);
    }
  }

  if (parts.length === 0) {
    return getEventTypeDescription(event.type);
  }
  return parts.join(" · ");
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

  const countsEntries = summary
    ? Object.entries(summary.countsByType)
        .filter(([type]) => type !== "CAMERA_STATUS")
        .sort((a, b) => b[1] - a[1])
    : [];
  const snapshots = (summary?.events || []).filter((e) => getSnapshotDataUrl(e.metadata) !== null);
  const live = summary?.liveTelemetry ?? null;

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Monitoring report: {attempt.candidate.fullName}</h1>
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
            <Link href={`/exams/${exam.id}/proctoring`} className="secondary-btn link-btn">Back to list</Link>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam</Link>
          </div>
        </div>

        {!summary ? (
          <div className="card question-section">
            <div className="error-message">Unable to load monitoring data.</div>
          </div>
        ) : (
          <>
            <div className="card question-section">
              <div className="question-section-head">
                <div>
                  <h2>Summary</h2>
                  <p className="muted">
                    Key behavior highlights and review progress for this candidate.
                  </p>
                </div>
                <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>{summary.warningLabel}</span>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">Items needing review</span>
                  <span className="stat-value">{summary.unresolvedCount}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Already reviewed</span>
                  <span className="stat-value">{summary.reviewedCount}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Camera photos saved</span>
                  <span className="stat-value">{snapshots.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Camera time</span>
                  <span className="stat-value">{live ? formatDurationFriendly(live.totalMonitoringDurationMs) : "—"}</span>
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Key observations</div>
                <ul style={{ marginLeft: 20, fontSize: 15, lineHeight: 1.7 }}>
                  {summary.warningReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                First recorded: <strong>{summary.firstEventAt ? fmtEventTime(summary.firstEventAt) : "—"}</strong> · Last recorded: <strong>{summary.lastEventAt ? fmtEventTime(summary.lastEventAt) : "—"}</strong>
              </div>
            </div>

            <div className="card question-section">
              <div className="question-section-head">
                <div>
                  <h2>Camera & Presence Overview</h2>
                  <p className="muted">
                    Latest reading from the candidate&apos;s webcam during the exam.
                  </p>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Camera setup</span>
                  <span className="detail-value">{formatCameraCheckStatus(attempt.cameraCheck?.status)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Candidate presence</span>
                  <span className="detail-value">{live ? formatFacePresence(live) : "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Eye focus</span>
                  <span className="detail-value">{live ? formatGazeDirection(live.eyeGazeDirection) : "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Head position</span>
                  <span className="detail-value">{live ? formatHeadOrientation(live.headOrientation) : "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Hands in view</span>
                  <span className="detail-value">
                    {live ? formatHandsVisibility(live.leftHandVisible, live.rightHandVisible) : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Both hands visible time</span>
                  <span className="detail-value">
                    {live ? formatDurationFriendly(live.bothHandsVisibleDurationMs) : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="card question-section">
              <div className="question-section-head">
                <div>
                  <h2>Activity Summary</h2>
                  <p className="muted">How many times each browser or camera activity occurred.</p>
                </div>
              </div>
              {countsEntries.length === 0 ? (
                <div className="empty-inline muted">No notable browser or camera activities recorded.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>What happened</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countsEntries.map(([type, count]) => (
                        <tr key={type}>
                          <td data-label="Activity">
                            <strong>{isKnownEventType(type) ? getEventTypeTitle(type) : type}</strong>
                          </td>
                          <td data-label="What happened" className="muted">
                            {isKnownEventType(type) ? getEventTypeDescription(type) : "Recorded during the exam."}
                          </td>
                          <td data-label="Count"><strong>{count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card question-section">
              <div className="question-section-head">
                <div>
                  <h2>Captured Photos</h2>
                  <p className="muted">
                    Webcam photos saved when an activity or routine check-in was recorded.
                  </p>
                </div>
              </div>
              {snapshots.length === 0 ? (
                <div className="empty-inline muted">No webcam photos were captured for this attempt.</div>
              ) : (
                <div className="snapshot-grid">
                  {snapshots.map((e) => {
                    const dataUrl = getSnapshotDataUrl(e.metadata);
                    if (!dataUrl) return null;
                    return (
                      <div key={e.id} className="snapshot-item">
                        {/* eslint-disable-next-line @next/next/no-img-element -- snapshot is a stored data URL */}
                        <img src={dataUrl} alt={`Webcam photo for ${getEventTypeTitle(e.type)}`} />
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                          {getEventTypeTitle(e.type)}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {fmtEventTime(e.occurredAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {attempt.cameraCheck?.note ? (
                <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                  Camera note: {attempt.cameraCheck.note}
                </div>
              ) : null}
            </div>

            <div className="card question-section">
              <div className="question-section-head">
                <div>
                  <h2>Timeline & Review</h2>
                  <p className="muted">
                    Chronological log of recorded events. Flag items that need follow-up or clear false alarms.
                  </p>
                </div>
              </div>
              {summary.events.length === 0 ? (
                <div className="empty-inline muted">No events recorded for this attempt.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Activity</th>
                        <th>Details</th>
                        <th>Photo</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.events.map((e) => {
                        const snapUrl = getSnapshotDataUrl(e.metadata);
                        return (
                          <tr key={e.id}>
                            <td data-label="Time" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                              {fmtEventTime(e.occurredAt)}
                            </td>
                            <td data-label="Activity">
                              <strong>{getEventTypeTitle(e.type)}</strong>
                            </td>
                            <td data-label="Details" className="muted" style={{ fontSize: 14 }}>
                              {renderFriendlyDetails(e)}
                            </td>
                            <td data-label="Photo">
                              {snapUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element -- snapshot is a stored data URL */
                                <img
                                  src={snapUrl}
                                  alt={`Webcam photo for ${getEventTypeTitle(e.type)}`}
                                  style={{
                                    width: 88,
                                    height: "auto",
                                    borderRadius: 6,
                                    border: "1px solid var(--color-border)",
                                    display: "block",
                                  }}
                                />
                              ) : (
                                <span className="muted" style={{ fontSize: 13 }}>No photo</span>
                              )}
                            </td>
                            <td data-label="Review">
                              <ProctorEventReviewControls
                                examId={exam.id}
                                attemptId={attempt.id}
                                eventId={e.id}
                                initialStatus={e.reviewStatus ?? "DETECTED"}
                              />
                            </td>
                          </tr>
                        );
                      })}
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
