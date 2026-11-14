import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { formatDateTime } from "@/features/exams/store";
import { listExamGradingOverview } from "@/features/essay-grading/service";

export const metadata = {
  title: "Essay grading | Argus AI",
};

function gradingBadge(summary: { essayTotalCount: number; essayFinalizedCount: number; essayDraftCount: number; essaySuggestedCount: number }) {
  if (summary.essayTotalCount === 0) return { label: "No essays", cls: "" };
  if (summary.essayFinalizedCount === summary.essayTotalCount) return { label: "Finalized", cls: "published" };
  if (summary.essayDraftCount > 0 || summary.essayFinalizedCount > 0) return { label: `In review (${summary.essayFinalizedCount}/${summary.essayTotalCount})`, cls: "draft" };
  if (summary.essaySuggestedCount > 0) return { label: "AI suggestions available", cls: "draft" };
  return { label: "Awaiting grading", cls: "draft" };
}

export default async function ExamGradingPage({ params }: { params: { id: string } }) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") redirect("/login");

  const result = await listExamGradingOverview({ examId: params.id, teacherId: session.user.id });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    redirect("/exams");
  }
  const { exam, items } = result.data;

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Grading: {exam.title}</h1>
            <p className="muted">Essay questions in this exam: <strong>{exam.questions.filter((q) => q.type === "ESSAY").length}</strong></p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam details</Link>
            <Link href={`/exams/${exam.id}/results`} className="secondary-btn link-btn">Results</Link>
            <Link href={`/exams/${exam.id}/proctoring`} className="secondary-btn link-btn">Proctoring</Link>
          </div>
        </div>

        <div className="card question-section">
          <div className="question-section-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>Attempts</h2>
              <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>Total: <strong>{items.length}</strong></p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty-state">No attempts for this exam yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Submission</th>
                    <th>Submitted at</th>
                    <th>MCQ</th>
                    <th>Essay (finalized)</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ attempt, summary }) => {
                    const badge = gradingBadge(summary);
                    const submitted = attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED";
                    return (
                      <tr key={attempt.id}>
                        <td data-label="Candidate"><strong>{attempt.candidate.fullName}</strong></td>
                        <td data-label="Submission">{attempt.status === "IN_PROGRESS" ? "In progress" : attempt.submitReason === "TIMEOUT" || attempt.status === "AUTO_SUBMITTED" ? "Auto-submitted" : "Submitted"}</td>
                        <td data-label="Submitted at">{formatDateTime(attempt.submittedAt)}</td>
                        <td data-label="MCQ">{summary.mcqEarned}/{summary.mcqPossible}</td>
                        <td data-label="Essay">{summary.essayEarned}/{summary.essayPossible}{!summary.allEssaysFinalized && summary.essayTotalCount > 0 ? <span className="muted"> (provisional)</span> : null}</td>
                        <td data-label="Progress">{summary.essayTotalCount === 0 ? "—" : `${summary.essayFinalizedCount}/${summary.essayTotalCount}`}</td>
                        <td data-label="Status"><span className={`status-badge ${badge.cls}`}>{badge.label}</span></td>
                        <td className="row-actions">
                          {submitted ? (
                            <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="primary-btn link-btn small-btn">Open grading</Link>
                          ) : (
                            <span className="muted" style={{ fontSize: 13 }}>Not submitted</span>
                          )}
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
