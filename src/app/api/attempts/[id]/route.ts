import { NextResponse } from "next/server";
import { getCandidateAttemptView } from "@/features/attempts/service";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const result = await getCandidateAttemptView(params.id);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: result.status ?? 404 });
  }
  return NextResponse.json(result.data.view);
}
