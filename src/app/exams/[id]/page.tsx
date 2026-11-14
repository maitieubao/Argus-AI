import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/features/auth/session";
import { getExamById, formatDateTime } from "@/features/exams/store";
import ExamForm from "@/features/exams/components/ExamForm";
import QuestionManager from "@/features/exams/components/QuestionManager";
import EssayQuestionManager from "@/features/exams/components/EssayQuestionManager";
import PublishPanel from "@/features/exams/components/PublishPanel";

export const metadata = {
  title: "Exam details | Argus AI",
};

export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { created?: string };
}) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    redirect("/login");
  }

  const exam = await getExamById(params.id);
  if (!exam) notFound();
  if (exam.ownerId !== session.user.id) {
    redirect("/exams");
  }

  const created = searchParams?.created === "1";

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>
              {exam.status === "DRAFT" ? "Draft exam" : "Published exam"}
            </p>
            <h1>{exam.title}</h1>
            <p className="muted">
              Duration: <strong>{exam.durationMinutes} min</strong> · Opens: <strong>{formatDateTime(exam.openAt)}</strong> · Closes: <strong>{formatDateTime(exam.closeAt)}</strong>
            </p>
            {exam.status === "PUBLISHED" ? (
              <p className="muted">
                Join code: <strong>{exam.joinCode ?? "—"}</strong> · Published: <strong>{formatDateTime(exam.publishedAt ?? null)}</strong>
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={`status-badge ${exam.status === "DRAFT" ? "draft" : "published"}`}>
              {exam.status === "DRAFT" ? "Draft" : "Published"}
            </span>
            <Link href={`/exams/${exam.id}/results`} className="secondary-btn link-btn">Results</Link>
            <Link href={`/exams/${exam.id}/grading`} className="secondary-btn link-btn">Grading</Link>
            <Link href={`/exams/${exam.id}/proctoring`} className="secondary-btn link-btn">Proctoring</Link>
            <Link href="/exams" className="secondary-btn link-btn">All exams</Link>
          </div>
        </div>

        {created ? (
          <div className="success-message" style={{ marginBottom: 16 }}>
            Exam draft created successfully.
          </div>
        ) : null}

        <ExamForm mode="edit" exam={exam} />
        <QuestionManager exam={exam} />
        <EssayQuestionManager exam={exam} />
        <PublishPanel exam={exam} />
      </section>
    </div>
  );
}
