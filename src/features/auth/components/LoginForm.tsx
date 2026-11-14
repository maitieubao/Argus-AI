"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  nextPath?: string;
};

export default function LoginForm({ nextPath }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter your email/username and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Incorrect credentials or access is not allowed.");
        return;
      }

      router.push(nextPath || "/exams");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card login-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="email">Email or username</label>
        <input
          id="email"
          name="email"
          type="text"
          className="input"
          autoComplete="username"
          placeholder="teacher@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </div>

      {error ? <div className="error-message" role="alert">{error}</div> : null}

      <button type="submit" className="button primary-btn" disabled={submitting}>
        {submitting ? "Signing in..." : "Sign in"}
      </button>

      <p className="hint">
        Demo account: <code>teacher@example.com</code> / <code>teacher123</code>
      </p>
    </form>
  );
}
