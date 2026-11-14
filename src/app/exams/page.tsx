import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/features/auth/session";
import { listExamsByOwner, formatDateTime } from "@/features/exams/store";

export const metadata = {
  title: "Exams | Argus AI",
};

export default async function ExamsPage() {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    redirect("/login");
  }

  const { user } = session;
  const exams = await listExamsByOwner(user.id);

  return (
    <div className="app-shell">
      <section className="content">
        <div className="content-head">
          <div>
            <h1>Exams</h1>
            <p className="muted">Create, configure, and manage your exams.</p>
          </div>
          <Link href="/exams/new" className="primary-btn link-btn">
            + New exam
          </Link>
        </div>

        {exams.length === 0 ? (
          <div className="empty-state">
            <h2>No exams yet</h2>
            <p className="muted">Create your first exam to get started.</p>
          </div>
        ) : (
          <div className="table-card">
            <table className="exam-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Join code</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <div className="exam-title">{exam.title}</div>
                      {exam.description ? (
                        <div className="exam-desc">{exam.description}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`status-badge ${exam.status === "DRAFT" ? "draft" : "published"}`}>
                        {exam.status === "DRAFT" ? "Draft" : "Published"}
                      </span>
                    </td>
                    <td>{exam.durationMinutes} min</td>
                    <td>{formatDateTime(exam.openAt)}</td>
                    <td>{formatDateTime(exam.closeAt)}</td>
                    <td>{exam.joinCode ?? "—"}</td>
                    <td className="actions-cell">
                      <Link href={`/exams/${exam.id}`} className="secondary-btn link-btn">
                        {exam.status === "DRAFT" ? "Edit exam" : "View exam"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
