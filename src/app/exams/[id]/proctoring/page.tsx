import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptsByExamId } from "@/features/attempts/store";
import { getProctoringSummaryForAttemptRecord } from "@/features/proctoring/service";
import { getEventTypeLabel, isKnownEventType } from "@/features/proctoring/domain";

export const metadata = {
  title: "Proctoring report | Argus AI",
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

export default async function ExamProctoringPage({ params }: { params: { id: string } }) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") redirect("/login");

  const exam = await getExamById(params.id);
  if (!exam) notFound();
  if (exam.ownerId !== session.user.id) redirect("/exams");

  const attempts = await getAttemptsByExamId(exam.id);
  const rows = await Promise.all(
    attempts.map(async (attempt) => {
      const summary = await getProctoringSummaryForAttemptRecord(attempt);
      return { attempt, summary };
    }),
  );

  let examTotalEvents = 0;
  let examReviewedCount = 0;
  let examUnresolvedCount = 0;
  let examTotalMonitoredMs = 0;
  const examCountsByType: Record<string, number> = {};

  for (const { summary } of rows) {
    examTotalEvents += summary.totalEvents;
    examReviewedCount += summary.reviewedCount;
    examUnresolvedCount += summary.unresolvedCount;
    examTotalMonitoredMs += summary.liveTelemetry?.totalMonitoringDurationMs ?? 0;
    for (const [t, c] of Object.entries(summary.countsByType)) {
      examCountsByType[t] = (examCountsByType[t] || 0) + c;
    }
  }

  const groupedTypeEntries = Object.entries(examCountsByType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Proctoring: {exam.title}</h1>
            <p className="muted">
              Join code: <strong>{exam.joinCode ?? "—"}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam details</Link>
            <Link href={`/exams/${exam.id}/results`} className="secondary-btn link-btn">Results</Link>
            <Link href={`/exams/${exam.id}/grading`} className="secondary-btn link-btn">Grading</Link>
          </div>
        </div>

        {/* Phase 5.3: Examination Summary Card */}
        <div className="card question-section">
          <div className="question-section-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>Examination Monitoring Summary</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                Aggregated AI-Proctor and browser behavior signals across all candidates
              </p>
            </div>
          </div>
          <div className="exam-info-block" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div>Total attempts: <strong>{rows.length}</strong></div>
            <div>Total detected events: <strong>{examTotalEvents}</strong></div>
            <div>Reviewed events: <strong>{examReviewedCount}</strong></div>
            <div>Unresolved events: <strong>{examUnresolvedCount}</strong></div>
            <div>Total AI monitoring time: <strong>{(examTotalMonitoredMs / 1000).toFixed(1)}s</strong></div>
          </div>
          {groupedTypeEntries.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Behavior Type</th>
                    <th>Description</th>
                    <th>Total Count</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedTypeEntries.map(([type, count]) => (
                    <tr key={type}>
                      <td data-label="Behavior Type"><code>{type}</code></td>
                      <td data-label="Description">{isKnownEventType(type) ? getEventTypeLabel(type) : type}</td>
                      <td data-label="Total Count"><strong>{count}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card question-section">
          <div className="question-section-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>Candidate Monitoring History</h2>
              <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>
                Total: <strong>{rows.length}</strong>
              </p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">No attempts for this exam yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Live AI Telemetry</th>
                    <th>Signal level</th>
                    <th>Events (Reviewed / Unresolved)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ attempt, summary }) => {
                    const live = summary.liveTelemetry;
                    return (
                      <tr key={attempt.id}>
                        <td data-label="Candidate">
                          <strong>{attempt.candidate.fullName}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Started: {formatDateTime(attempt.startedAt)}
                          </div>
                        </td>
                        <td data-label="Status">{attemptStatusLabel(attempt.status, attempt.submitReason)}</td>
                        <td data-label="Live AI Telemetry" style={{ fontSize: 13 }}>
                          {live ? (
                            <div>
                              <div>
                                Face: <strong>{live.cameraObstructed ? "Obstructed" : live.faceCount >= 2 ? `Multi (${live.faceCount})` : live.faceVisible ? "OK" : "Missing"}</strong> · Gaze: <strong>{live.eyeGazeDirection}</strong>
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                Head: {live.headOrientation} · Hands L/R: {live.leftHandVisible ? "OK" : "—"}/{live.rightHandVisible ? "OK" : "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="muted">Camera check: {attempt.cameraCheck?.status ?? "not_checked"}</span>
                          )}
                        </td>
                        <td data-label="Signal level">
                          <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>
                            {summary.warningLabel}
                          </span>
                        </td>
                        <td data-label="Events">
                          <strong>{summary.totalEvents}</strong>{" "}
                          <span className="muted" style={{ fontSize: 12 }}>
                            ({summary.reviewedCount} reviewed / {summary.unresolvedCount} unresolved)
                          </span>
                        </td>
                        <td className="row-actions">
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="secondary-btn link-btn small-btn">Grade</Link>
                            <Link href={`/exams/${exam.id}/attempts/${attempt.id}`} className="secondary-btn link-btn small-btn">View details</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
