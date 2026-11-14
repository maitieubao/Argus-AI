import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { createEssayQuestion, createMcqQuestion } from "@/features/exams/store";
import type { EssayQuestionInput, McqQuestionInput } from "@/features/exams/domain";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
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
    ? await createEssayQuestion(params.id, session.user.id, b as EssayQuestionInput)
    : await createMcqQuestion(params.id, session.user.id, b as McqQuestionInput);

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : result.code === "NOT_DRAFT"
            ? 409
            : 400;
    return NextResponse.json({ errors: result.errors }, { status });
  }

  return NextResponse.json({ exam: result.exam, question: result.question }, { status: 201 });
}
