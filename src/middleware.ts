import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/constants";

function verifyTokenEdge(token: string | undefined, secret: string): boolean {
  // Edge middleware cannot use Node crypto/timingSafeEqual reliably in all runtimes,
  // so we perform a lightweight structural + expiry check here.
  // Full signature verification is enforced in server components/route handlers via auth.ts.
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const payload = parts[0];
    // base64url decode
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const session = JSON.parse(json) as { exp?: number; user?: { role?: string } };
    if (!session?.exp || !session?.user?.role) return false;
    if (Date.now() > session.exp) return false;
    if (session.user.role !== "TEACHER") return false;
    // basic sanity that a secret exists (signature validated server-side)
    return secret.length > 0;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET || "argus-ai-dev-secret-change-me";
  const isAuthedTeacher = verifyTokenEdge(token, secret);

  // Protect exam management area
  if (pathname.startsWith("/exams")) {
    if (!isAuthedTeacher) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Redirect authenticated teacher away from login
  if (pathname === "/login" && isAuthedTeacher) {
    return NextResponse.redirect(new URL("/exams", request.url));
  }

  // Home -> exams (for teacher) or login
  if (pathname === "/") {
    return NextResponse.redirect(new URL(isAuthedTeacher ? "/exams" : "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/exams/:path*"],
};
