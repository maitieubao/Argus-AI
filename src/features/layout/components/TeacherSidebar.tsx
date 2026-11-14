"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/features/auth/components/LogoutButton";

type Props = {
  user: { name: string; email: string };
};

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TeacherSidebar({ user }: Props) {
  const pathname = usePathname() || "";
  const inExams = isActive(pathname, "/exams");

  return (
    <aside className="sidebar" aria-label="Teacher navigation">
      <div className="sidebar-top">
        <Link href="/exams" className="sidebar-brand" aria-label="Argus AI exams">
          <span className="sidebar-wordmark">Argus AI</span>
          <span className="sidebar-brand-sub">Teacher</span>
        </Link>
        <nav className="sidebar-nav" aria-label="Primary">
          <Link
            href="/exams"
            className={`sidebar-link ${isActive(pathname, "/exams", true) || (inExams && pathname !== "/exams/new") ? "active" : ""}`}
          >
            Exams
          </Link>
          <Link
            href="/exams/new"
            className={`sidebar-link ${isActive(pathname, "/exams/new") ? "active" : ""}`}
          >
            New exam
          </Link>
        </nav>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
