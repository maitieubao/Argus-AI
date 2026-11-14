import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/session";

export default function Home() {
  const session = getSession();
  if (session && session.user.role === "TEACHER") {
    redirect("/exams");
  }
  redirect("/login");
}
