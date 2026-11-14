import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { createExam, listExamsByOwner } from "@/features/exams/store";
import type { ExamInput } from "@/features/exams/domain";

export async function GET() {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const exams = await listExamsByOwner(session.user.id);
  return NextResponse.json({ exams });
}

export async function POST(request: Request) {
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
  const result = await createExam(session.user.id, input);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({ exam: result.exam }, { status: 201 });
}
