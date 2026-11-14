import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { getAttemptGradingContext, saveTeacherEssayEvaluation } from "@/features/essay-grading/service";

type Params = { params: { id: string; attemptId: string } };

export async function GET(_request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await getAttemptGradingContext({
    examId: params.id,
    attemptId: params.attemptId,
    teacherId: session.user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.data);
}

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
  const questionId = typeof b.questionId === "string" ? b.questionId : "";
  const finalize = b.finalize === true;
  if (!questionId) {
    return NextResponse.json({ errors: { form: "questionId is required." } }, { status: 400 });
  }

  const result = await saveTeacherEssayEvaluation({
    examId: params.id,
    attemptId: params.attemptId,
    teacherId: session.user.id,
    questionId,
    input: b.evaluation ?? b,
    finalize,
  });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
