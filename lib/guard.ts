// Server-side capability guard for API routes, now board-aware. Uses the
// viewer's role on the CURRENT board (admins act at PO level everywhere).
import { NextResponse } from "next/server";
import { getCurrentBoard } from "@/lib/board";
import { getSession } from "@/lib/session";
import { can, type Capability } from "@/lib/permissions";

export async function requireCap(cap: Capability): Promise<NextResponse | null> {
  const [board, session] = await Promise.all([getCurrentBoard(), getSession()]);
  if (!board || !session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Local (stakeholder) accounts are read-only. can() blocks this too; the
  // duplicate check here is deliberate - it means a future refactor of the
  // capability table cannot accidentally grant write access to an account that
  // has no Atlassian identity.
  if (session.authType === "local")
    return NextResponse.json(
      { error: "This account has read-only access" },
      { status: 403 }
    );

  if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin, authType: session.authType }, cap))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
