import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import { formatDateTime } from "@/features/exams/store";
import { getAttemptGradingContext } from "@/features/essay-grading/service";
import EssayGradingWorkspace from "@/features/essay-grading/components/EssayGradingWorkspace";

export const metadata = {
  title: "Grade attempt | Argus AI",
};

export default async function ExamAttemptGradingPage({ params }: { params: { id: string; attemptId: string } }) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") redirect("/login");

  const result = await getAttemptGradingContext({
    examId: params.id,
    attemptId: params.attemptId,
    teacherId: session.user.id,
  });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    redirect("/exams");
  }

  const { exam, attempt } = result.data;

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>Grade: {attempt.candidate.fullName}</h1>
            <p className="muted">
              Exam: <strong>{exam.title}</strong> · Submitted: <strong>{formatDateTime(attempt.submittedAt)}</strong> · Status: <strong>{attempt.status}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/exams/${exam.id}/grading`} className="secondary-btn link-btn">Back to grading</Link>
            <Link href={`/exams/${exam.id}/attempts/${attempt.id}`} className="secondary-btn link-btn">Proctoring</Link>
            <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">Exam</Link>
          </div>
        </div>

        {attempt.status === "IN_PROGRESS" ? (
          <div className="card question-section"><div className="error-message">This attempt has not been submitted yet and cannot be graded.</div></div>
        ) : (
          <EssayGradingWorkspace examId={exam.id} attemptId={attempt.id} initial={result.data} />
        )}
      </section>
    </div>
  );
}
