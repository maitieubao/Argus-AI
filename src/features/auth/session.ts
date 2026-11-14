import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

export type UserRole = "TEACHER";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type Session = {
  user: SessionUser;
  exp: number; // unix ms
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const DEMO_EMAIL = "teacher@example.com";
const DEMO_PASSWORD = "teacher123";

function getSecret(): string {
  return process.env.AUTH_SECRET || "argus-ai-dev-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const session: Session = { user, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = sign(payload);
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const session = JSON.parse(json) as Session;
    if (!session?.user || !session?.exp) return null;
    if (Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export function authenticateTeacher(
  email: string,
  password: string,
): SessionUser | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return {
      id: "teacher-1",
      email: DEMO_EMAIL,
      name: "Demo Teacher",
      role: "TEACHER",
    };
  }
  return null;
}

export function getSession(): Session | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function requireTeacherSession(): Session | null {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") return null;
  return session;
}

export function setSessionCookie(response: NextResponse, user: SessionUser) {
  const token = createSessionToken(user);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    // Allow HTTP localhost for demo use. Set AUTH_COOKIE_SECURE=true behind HTTPS in production.
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 0,
  });
}
