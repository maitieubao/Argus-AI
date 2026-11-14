import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { getExamById, updateExamDraft } from "@/features/exams/store";
import type { ExamInput } from "@/features/exams/domain";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const exam = await getExamById(params.id);
  if (!exam) {
    return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  }
  if (exam.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ exam });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const input: ExamInput =
    body && typeof body === "object" ? (body as ExamInput) : {};
  const result = await updateExamDraft(params.id, session.user.id, input);
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

  return NextResponse.json({ exam: result.exam });
}
