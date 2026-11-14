import { NextResponse } from "next/server";
import { saveAttemptAnswers } from "@/features/attempts/service";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request data." } }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const result = await saveAttemptAnswers({
    attemptId: params.id,
    answersPatch: b.answers,
  });

  if (!result.ok) {
    // For already submitted, return current view context if caller wants; keep simple
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, savedAt: result.data.savedAt, expired: result.data.expired, view: result.data.view });
}
