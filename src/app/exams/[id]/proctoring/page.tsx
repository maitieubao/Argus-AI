import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import { getAttemptsByExamId } from "@/features/attempts/store";
import { getProctoringSummaryForAttemptRecord } from "@/features/proctoring/service";

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

        <div className="card question-section">
          <div className="question-section-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>Attempts</h2>
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
                    <th>Started</th>
                    <th>Submitted</th>
                    <th>Signal level</th>
                    <th>Total events</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ attempt, summary }) => (
                    <tr key={attempt.id}>
                      <td data-label="Candidate">
                        <strong>{attempt.candidate.fullName}</strong>
                      </td>
                      <td data-label="Status">{attemptStatusLabel(attempt.status, attempt.submitReason)}</td>
                      <td data-label="Started">{formatDateTime(attempt.startedAt)}</td>
                      <td data-label="Submitted">{formatDateTime(attempt.submittedAt)}</td>
                      <td data-label="Signal level">
                        <span className={`risk-badge ${levelClass(summary.warningLevel)}`}>
                          {summary.warningLabel}
                        </span>
                      </td>
                      <td data-label="Total events">{summary.totalEvents}</td>
                      <td className="row-actions">
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="secondary-btn link-btn small-btn">Grade</Link>
                          <Link href={`/exams/${exam.id}/attempts/${attempt.id}`} className="secondary-btn link-btn small-btn">View details</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
