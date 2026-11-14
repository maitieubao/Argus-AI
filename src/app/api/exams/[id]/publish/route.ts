import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/session";
import { publishExam } from "@/features/exams/store";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  const session = getSession();
  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await publishExam(params.id, session.user.id);
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
