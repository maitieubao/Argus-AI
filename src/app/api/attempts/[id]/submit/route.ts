import { NextResponse } from "next/server";
import { submitAttempt } from "@/features/attempts/service";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const result = await submitAttempt({ attemptId: params.id, reasonHint: b.reason });
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors, code: result.code }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, view: result.data.view });
}
