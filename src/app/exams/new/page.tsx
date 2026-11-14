import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/features/auth/session";
import ExamForm from "@/features/exams/components/ExamForm";

export const metadata = {
  title: "New exam | Argus AI",
};

export default function NewExamPage() {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <section className="content narrow">
        <div className="content-head">
          <div>
            <h1>New exam</h1>
            <p className="muted">Create a draft exam. You can add questions after saving.</p>
          </div>
          <Link href="/exams" className="secondary-btn link-btn">Back to exams</Link>
        </div>
        <ExamForm mode="create" />
      </section>
    </div>
  );
}
