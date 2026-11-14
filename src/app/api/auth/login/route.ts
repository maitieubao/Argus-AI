import { NextResponse } from "next/server";
import { authenticateTeacher, setSessionCookie } from "@/features/auth/session";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as
      | { email?: string; username?: string; password?: string }
      | null;

    const email = (body?.email || body?.username || "").toString();
    const password = (body?.password || "").toString();

    if (!email.trim() || !password) {
      return NextResponse.json(
        { error: "Please enter your email/username and password." },
        { status: 400 },
      );
    }

    const user = authenticateTeacher(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Incorrect credentials or access is not allowed." },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ ok: true, user: { name: user.name, email: user.email, role: user.role } });
    setSessionCookie(res, user);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
