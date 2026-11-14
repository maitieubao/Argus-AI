import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptById } from "@/features/attempts/store";
import { getProctoringSummaryByAttempt } from "@/features/proctoring/service";
import { getEventTypeLabel, isKnownEventType } from "@/features/proctoring/domain";

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

function getSnapshotDataUrl(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const dataUrl = meta.dataUrl;
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : null;
}

function renderMetadata(meta: Record<string, unknown> | null) {
  if (!meta) return "—";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (k === "dataUrl") continue;
    if (v == null || v === "") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}: ${String(v)}`);
    }
  }
  if (getSnapshotDataUrl(meta)) {
    parts.push("snapshot attached");
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
  const snapshots = (summary?.events || []).filter(
    (e) => e.type === "CAMERA_SNAPSHOT" && getSnapshotDataUrl(e.metadata) !== null,
  );

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
            <div className="card question-section">
              <div className="question-section-head" style={{ marginBottom: 8 }}>
                <div>
                  <h2>Summary</h2>
                </div>
                <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>{summary.warningLabel}</span>
              </div>
              <div className="exam-info-block" style={{ marginBottom: 10 }}>
                <div>Total events: <strong>{summary.totalEvents}</strong></div>
                <div>
                  First event: <strong>{summary.firstEventAt ? fmtEventTime(summary.firstEventAt) : "—"}</strong> · Last event: <strong>{summary.lastEventAt ? fmtEventTime(summary.lastEventAt) : "—"}</strong>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--nb-black)" }}>Reasons</div>
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
                  <h2>Camera snapshots</h2>
                </div>
              </div>
              {snapshots.length === 0 ? (
                <div className="muted">No camera snapshots recorded.</div>
              ) : (
                <div className="snapshot-grid">
                  {snapshots.map((e) => {
                    const dataUrl = getSnapshotDataUrl(e.metadata);
                    if (!dataUrl) return null;
                    return (
                      <div key={e.id} className="snapshot-item">
                        {/* eslint-disable-next-line @next/next/no-img-element -- snapshot is a stored data URL */}
                        <img src={dataUrl} alt="Camera snapshot" />
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
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
                  <h2>Event timeline</h2>
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
                        <th>Metadata</th>
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
