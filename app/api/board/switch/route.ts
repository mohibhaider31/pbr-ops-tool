export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAccessibleBoards, BOARD_COOKIE_NAME } from "@/lib/board";

// Switch the active board (must be one the user can access).
export async function POST(req: Request) {
  const { boardId }: { boardId: string } = await req.json();
  const accessible = await getAccessibleBoards();
  if (!accessible.find((b) => b.id === boardId))
    return NextResponse.json({ error: "no access to that board" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${BOARD_COOKIE_NAME}=${boardId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=Lax`
  );
  return res;
}
