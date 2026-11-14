import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { generateSuggestionForEssay } from "@/features/essay-grading/service";

type Params = { params: { id: string; attemptId: string } };

export async function POST(request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const questionId = typeof b.questionId === "string" ? b.questionId : "";
  if (!questionId) {
    return NextResponse.json({ errors: { form: "questionId is required." } }, { status: 400 });
  }

  const result = await generateSuggestionForEssay({
    examId: params.id,
    attemptId: params.attemptId,
    teacherId: session.user.id,
    questionId,
  });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, ...result.data });
}
