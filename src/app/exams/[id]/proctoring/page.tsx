import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptsByExamId } from "@/features/attempts/store";
import { getProctoringSummaryForAttemptRecord } from "@/features/proctoring/service";
import {
  formatCameraCheckStatus,
  formatDurationFriendly,
  formatFacePresence,
  formatGazeDirection,
  formatHandsVisibility,
  getEventTypeDescription,
  getEventTypeTitle,
  isKnownEventType,
} from "@/features/proctoring/domain";

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

  let examReviewedCount = 0;
  let examUnresolvedCount = 0;
  let examTotalMonitoredMs = 0;
  const examCountsByType: Record<string, number> = {};

  for (const { summary } of rows) {
    examReviewedCount += summary.reviewedCount;
    examUnresolvedCount += summary.unresolvedCount;
    examTotalMonitoredMs += summary.liveTelemetry?.totalMonitoringDurationMs ?? 0;
    for (const [t, c] of Object.entries(summary.countsByType)) {
      if (t === "CAMERA_STATUS") continue;
      examCountsByType[t] = (examCountsByType[t] || 0) + c;
    }
  }

  const groupedTypeEntries = Object.entries(examCountsByType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Monitoring report: {exam.title}</h1>
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

        <div className="card question-section">
          <div className="question-section-head">
            <div>
              <h2>Overview</h2>
              <p className="muted">
                Summary of candidate focus, tab switches, and camera checks across this exam.
              </p>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Candidates</span>
              <span className="stat-value">{rows.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Items needing review</span>
              <span className="stat-value">{examUnresolvedCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Already reviewed</span>
              <span className="stat-value">{examReviewedCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total camera time</span>
              <span className="stat-value">{formatDurationFriendly(examTotalMonitoredMs)}</span>
            </div>
          </div>

          {groupedTypeEntries.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>What happened</th>
                    <th>Times recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedTypeEntries.map(([type, count]) => (
                    <tr key={type}>
                      <td data-label="Activity">
                        <strong>{isKnownEventType(type) ? getEventTypeTitle(type) : type}</strong>
                      </td>
                      <td data-label="What happened" className="muted">
                        {isKnownEventType(type) ? getEventTypeDescription(type) : "Recorded during the exam."}
                      </td>
                      <td data-label="Times recorded">
                        <strong>{count}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-inline muted">No notable browser or camera alerts recorded yet.</div>
          )}
        </div>

        <div className="card question-section">
          <div className="question-section-head">
            <div>
              <h2>Candidates</h2>
              <p className="muted">
                Select &ldquo;View report&rdquo; to inspect photos, timeline, and review flags for a candidate.
              </p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">No candidates have joined this exam yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Exam status</th>
                    <th>Latest camera check</th>
                    <th>Attention</th>
                    <th>Items to review</th>
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
                          <div className="muted" style={{ fontSize: 13 }}>
                            Started {formatDateTime(attempt.startedAt)}
                          </div>
                        </td>
                        <td data-label="Exam status">{attemptStatusLabel(attempt.status, attempt.submitReason)}</td>
                        <td data-label="Latest camera check" style={{ fontSize: 14 }}>
                          {live ? (
                            <div>
                              <div>
                                <strong>{formatFacePresence(live)}</strong> · {formatGazeDirection(live.eyeGazeDirection)}
                              </div>
                              <div className="muted" style={{ fontSize: 13 }}>
                                {formatHandsVisibility(live.leftHandVisible, live.rightHandVisible)}
                              </div>
                            </div>
                          ) : (
                            <span className="muted">Camera: {formatCameraCheckStatus(attempt.cameraCheck?.status)}</span>
                          )}
                        </td>
                        <td data-label="Attention">
                          <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>
                            {summary.warningLabel}
                          </span>
                        </td>
                        <td data-label="Items to review">
                          <strong>{summary.unresolvedCount}</strong>{" "}
                          <span className="muted" style={{ fontSize: 13 }}>
                            pending ({summary.reviewedCount} reviewed)
                          </span>
                        </td>
                        <td className="row-actions">
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="secondary-btn link-btn small-btn">Grade</Link>
                            <Link href={`/exams/${exam.id}/attempts/${attempt.id}`} className="secondary-btn link-btn small-btn">View report</Link>
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
