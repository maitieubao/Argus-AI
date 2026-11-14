import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";
import TeacherSidebar from "@/features/layout/components/TeacherSidebar";

export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    redirect("/login");
  }

  return (
    <div className="app-layout">
      <TeacherSidebar user={{ name: session.user.name, email: session.user.email }} />
      <div className="app-main">{children}</div>
    </div>
  );
}
