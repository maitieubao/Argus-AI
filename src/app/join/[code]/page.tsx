import Link from "next/link";
import JoinFlow from "@/features/attempts/components/JoinFlow";

export const metadata = {
  title: "Join exam | Argus AI",
};

export default async function JoinExamPage({
  params,
}: {
  params: { code: string };
}) {
  const code = (params.code || "").toUpperCase();

  return (
    <main className="hero">
      <div className="login-wrap" style={{ maxWidth: 560 }}>
        <div className="brand">
          <div className="brand-badge">Candidate</div>
          <h1>Join exam</h1>
          <p className="subtitle">Join code: <strong>{code || "—"}</strong></p>
        </div>
        <JoinFlow code={code} />
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/login" className="muted" style={{ fontSize: 14, textDecoration: "underline" }}>
            Teacher login
          </Link>
        </div>
      </div>
    </main>
  );
}
