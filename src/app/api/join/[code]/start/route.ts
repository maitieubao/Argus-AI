import { NextResponse } from "next/server";
import { startAttempt } from "@/features/attempts/service";

type Params = { params: { code: string } };

export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request data." } }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const result = await startAttempt({
    codeRaw: params.code,
    candidateInput: b.candidate,
    consentAccepted: b.consentAccepted,
    cameraCheckInput: b.cameraCheck,
  });

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ attemptId: result.data.attemptId }, { status: 201 });
}
