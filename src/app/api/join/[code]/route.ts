import { NextResponse } from "next/server";
import { getPublicJoinInfo } from "@/features/attempts/service";

type Params = { params: { code: string } };

export async function GET(_request: Request, { params }: Params) {
  const result = await getPublicJoinInfo(params.code);
  return NextResponse.json(result);
}
