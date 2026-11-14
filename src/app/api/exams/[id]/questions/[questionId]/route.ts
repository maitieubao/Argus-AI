import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { deleteQuestion, updateEssayQuestion, updateMcqQuestion } from "@/features/exams/store";
import type { EssayQuestionInput, McqQuestionInput } from "@/features/exams/domain";

type Params = { params: { id: string; questionId: string } };

export async function PATCH(request: Request, { params }: Params) {
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
  const isEssay = b.type === "ESSAY";

  const result = isEssay
    ? await updateEssayQuestion(params.id, params.questionId, session.user.id, b as EssayQuestionInput)
    : await updateMcqQuestion(params.id, params.questionId, session.user.id, b as McqQuestionInput);

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" || result.code === "QUESTION_NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : result.code === "NOT_DRAFT"
            ? 409
            : 400;
    return NextResponse.json({ errors: result.errors }, { status });
  }

  return NextResponse.json({ exam: result.exam, question: result.question });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteQuestion(params.id, params.questionId, session.user.id);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" || result.code === "QUESTION_NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : result.code === "NOT_DRAFT"
            ? 409
            : 400;
    return NextResponse.json({ errors: result.errors }, { status });
  }

  return NextResponse.json({ exam: result.exam });
}
