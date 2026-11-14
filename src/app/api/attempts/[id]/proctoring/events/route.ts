import { NextResponse } from "next/server";
import { recordProctoringEvents } from "@/features/proctoring/service";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Invalid request data." } }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const events = Array.isArray(b.events) ? b.events : null;
  if (!events) {
    return NextResponse.json({ errors: { form: "Invalid proctoring events payload." } }, { status: 400 });
  }

  const result = await recordProctoringEvents({ attemptId: params.id, events });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.data }, { status: 201 });
}
