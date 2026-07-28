// Server-side capability guard for API routes, now board-aware. Uses the
// viewer's role on the CURRENT board (admins act at PO level everywhere).
import { NextResponse } from "next/server";
import { getCurrentBoard } from "@/lib/board";
import { can, type Capability } from "@/lib/permissions";

export async function requireCap(cap: Capability): Promise<NextResponse | null> {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin }, cap))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
