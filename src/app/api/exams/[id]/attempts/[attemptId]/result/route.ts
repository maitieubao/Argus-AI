import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { setAttemptResultPublished } from "@/features/attempts/service";

type Params = { params: { id: string; attemptId: string } };

export async function PUT(request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request data." } }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof b.published !== "boolean") {
    return NextResponse.json({ errors: { published: "Invalid publish status." } }, { status: 400 });
  }

  const result = await setAttemptResultPublished({
    examId: params.id,
    attemptId: params.attemptId,
    teacherId: session.user.id,
    published: b.published,
  });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }

  return NextResponse.json({ ok: true, ...result.data });
}
