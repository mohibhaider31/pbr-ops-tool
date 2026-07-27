export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { accountId: s.accountId, name: s.name, email: s.email, avatarUrl: s.avatarUrl },
  });
}
