import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { formatDateTime } from "@/features/exams/store";
import { getExamResultsReport } from "@/features/attempts/service";
import { isGradingCompleteForPublish, isResultPublished, isSubmitted } from "@/features/attempts/domain";
import { computeEssayGradingSummary } from "@/features/essay-grading/domain";
import ResultsPublishControls from "./ResultsPublishControls";

export const metadata = {
  title: "Exam results & report | Argus AI",
};

function attemptStatusLabel(status: string, submitReason: string | null) {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "AUTO_SUBMITTED" || submitReason === "TIMEOUT") return "Auto-submitted (time expired)";
  return "Submitted";
}

function gradingStatusLabel(summary: ReturnType<typeof computeEssayGradingSummary>) {
  if (summary.essayTotalCount === 0) return "Complete (MCQ only)";
  if (summary.allEssaysFinalized) return "Essay grading finalized";
  if (summary.essayDraftCount > 0 || summary.essayFinalizedCount > 0) {
    return `In review (${summary.essayFinalizedCount}/${summary.essayTotalCount})`;
  }
  return "Awaiting essay grading";
}

function levelClass(level: string) {
  if (level === "HIGH") return "risk-high";
  if (level === "MEDIUM") return "risk-medium";
  if (level === "LOW") return "risk-low";
  return "risk-none";
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export default async function ExamResultsPage({ params }: { params: { id: string } }) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") redirect("/login");

  const result = await getExamResultsReport({ examId: params.id, teacherId: session.user.id });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    redirect("/exams");
  }

  const { exam, attempts, summary } = result.data;
  const essayQuestionsCount = exam.questions.filter((q) => q.type === "ESSAY").length;

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Results: {exam.title}</h1>
            <p className="muted">
              Join code: <strong>{exam.joinCode ?? "—"}</strong> · Essay questions: <strong>{essayQuestionsCount}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam details</Link>
            <Link href={`/exams/${exam.id}/grading`} className="secondary-btn link-btn">Grading</Link>
            <Link href={`/exams/${exam.id}/proctoring`} className="secondary-btn link-btn">Proctoring</Link>
          </div>
        </div>

        <div className="exam-meta-grid" style={{ marginBottom: 16 }}>
          <div className="exam-meta-item"><div className="muted">Total attempts</div><div style={{ fontWeight: 700, fontSize: 20 }}>{summary.totalAttempts}</div></div>
          <div className="exam-meta-item"><div className="muted">Submitted</div><div style={{ fontWeight: 700, fontSize: 20 }}>{summary.submittedCount}</div></div>
          <div className="exam-meta-item"><div className="muted">Grading complete</div><div style={{ fontWeight: 700, fontSize: 20 }}>{summary.gradingCompleteCount}</div></div>
          <div className="exam-meta-item"><div className="muted">Published</div><div style={{ fontWeight: 700, fontSize: 20 }}>{summary.publishedCount}</div></div>
        </div>

        <div className="card question-section">
          <div className="question-section-head" style={{ marginBottom: 10 }}>
            <div>
              <h2>Attempts</h2>
              <p className="muted" style={{ fontSize: 14, marginTop: 2 }}>Track submissions, grading, and result publishing.</p>
            </div>
          </div>

          {attempts.length === 0 ? (
            <div className="empty-state">No attempts for this exam yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Submission</th>
                    <th>Grading</th>
                    <th>Scores</th>
                    <th>Proctoring</th>
                    <th>Published</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map(({ attempt, proctoring }) => {
                    const submitted = isSubmitted(attempt.status);
                    const grading = computeEssayGradingSummary(attempt, exam);
                    const mcq = attempt.mcqResult;
                    const mcqText = mcq ? `${mcq.totalEarned}/${mcq.totalPossible}` : "—";
                    const essayText = grading.essayTotalCount > 0
                      ? `${grading.essayEarned}/${grading.essayPossible}${grading.allEssaysFinalized ? "" : " (finalized only)"}`
                      : "—";
                    const overallText = mcq
                      ? `${round((mcq.totalEarned ?? 0) + (grading.essayEarned ?? 0))}/${round((mcq.totalPossible ?? 0) + (grading.essayPossible ?? 0))}${grading.allEssaysFinalized ? "" : grading.essayTotalCount > 0 ? " (provisional)" : ""}`
                      : "—";
                    const published = isResultPublished(attempt);
                    const gradingComplete = isGradingCompleteForPublish(attempt);

                    return (
                      <tr key={attempt.id}>
                        <td data-label="Candidate">
                          <strong>{attempt.candidate.fullName}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>Started: {formatDateTime(attempt.startedAt)}</div>
                        </td>
                        <td data-label="Submission">
                          <div>{attemptStatusLabel(attempt.status, attempt.submitReason)}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{formatDateTime(attempt.submittedAt)}</div>
                        </td>
                        <td data-label="Grading">
                          {submitted ? gradingStatusLabel(grading) : "Not submitted"}
                          {submitted && grading.essayTotalCount > 0 ? (
                            <div className="muted" style={{ fontSize: 12 }}>{grading.essayFinalizedCount}/{grading.essayTotalCount} essays finalized</div>
                          ) : null}
                        </td>
                        <td data-label="Scores">
                          {submitted ? (
                            <div style={{ fontSize: 13 }}>
                              <div>MCQ: <strong>{mcqText}</strong></div>
                              <div>Essay: <strong>{essayText}</strong></div>
                              <div>Total: <strong>{overallText}</strong></div>
                            </div>
                          ) : "—"}
                        </td>
                        <td data-label="Proctoring">
                          <span className={`risk-badge ${levelClass(proctoring.warningLevel)}`}>{proctoring.warningLabel}</span>
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{proctoring.totalEvents} events</div>
                        </td>
                        <td data-label="Published">
                          {published ? (
                            <>
                              <span className="status-badge published">Published</span>
                              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{formatDateTime(attempt.resultPublishedAt)}</div>
                            </>
                          ) : (
                            <span className="status-badge draft">Not published</span>
                          )}
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
                            {submitted ? (
                              <ResultsPublishControls
                                examId={exam.id}
                                attemptId={attempt.id}
                                published={published}
                                gradingComplete={gradingComplete}
                                submitted={submitted}
                              />
                            ) : (
                              <span className="muted" style={{ fontSize: 13 }}>Not available (not submitted)</span>
                            )}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {grading.essayTotalCount > 0 && submitted ? (
                                <Link href={`/exams/${exam.id}/grading/${attempt.id}`} className="secondary-btn link-btn small-btn">Grade</Link>
                              ) : null}
                              <Link href={`/exams/${exam.id}/attempts/${attempt.id}`} className="secondary-btn link-btn small-btn">Proctoring</Link>
                            </div>
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
