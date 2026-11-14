import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { getExamById } from "@/features/exams/store";
import { getAttemptById } from "@/features/attempts/store";
import { reviewProctoringEventForAttempt } from "@/features/proctoring/service";

type Params = {
  params: { id: string; attemptId: string; eventId: string };
};

export async function PATCH(request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ errors: { form: "Authentication required." } }, { status: 401 });
  }

  const exam = await getExamById(params.id);
  if (!exam) {
    return NextResponse.json({ errors: { form: "Exam not found." } }, { status: 404 });
  }
  if (exam.ownerId !== session.user.id) {
    return NextResponse.json({ errors: { form: "Forbidden." } }, { status: 403 });
  }

  const attempt = await getAttemptById(params.attemptId);
  if (!attempt || attempt.examId !== exam.id) {
    return NextResponse.json({ errors: { form: "Exam attempt not found." } }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request payload." } }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const targetStatus = b.targetStatus;
  if (targetStatus !== "CONFIRMED" && targetStatus !== "RESOLVED") {
    return NextResponse.json(
      { errors: { form: "targetStatus must be CONFIRMED or RESOLVED." } },
      { status: 400 },
    );
  }

  const reviewNote = typeof b.reviewNote === "string" ? b.reviewNote : null;
  const result = await reviewProctoringEventForAttempt({
    attemptId: attempt.id,
    eventId: params.eventId,
    targetStatus,
    actorId: session.user.id,
    reviewNote,
  });

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: result.status });
  }

  return NextResponse.json({ ok: true, event: result.data });
}
