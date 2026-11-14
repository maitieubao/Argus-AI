import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import LoginForm from "@/features/auth/components/LoginForm";

export const metadata = {
  title: "Teacher login | Argus AI",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const session = getSession();
  if (session && session.user.role === "TEACHER") {
    redirect("/exams");
  }

  const nextPath =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/exams")
      ? searchParams.next
      : "/exams";

  return (
    <main className="page-center">
      <div className="login-wrap">
        <div className="brand">
          <span className="brand-badge">Argus AI</span>
          <h1>Teacher area</h1>
          <p className="subtitle">Sign in to create, manage, and publish exams.</p>
        </div>
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
